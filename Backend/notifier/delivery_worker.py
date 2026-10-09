"""Durable recipient delivery. Ambiguous sends require review instead of blind retry."""
from datetime import datetime, timedelta, timezone
import hashlib
import time

import requests
from pymongo import ReturnDocument

from db.job_leases import JobLease
from event_normalization import lifecycle_values


def _key(intent, chat_id):
    return hashlib.sha256(f"{intent['key']}:{chat_id}".encode()).hexdigest()


def recipients(database, event, created_at=None):
    from notifier.telegram_bot import TELEGRAM_CHAT_ID
    seen = set()
    if TELEGRAM_CHAT_ID:
        seen.add(str(TELEGRAM_CHAT_ID))
        yield str(TELEGRAM_CHAT_ID)
    cutoff = datetime.fromisoformat(created_at).timestamp() if created_at else None
    for subscriber in database.subscribers.find({"is_active": True}, {"chat_id": 1, "preference": 1, "subscribed_at": 1}):
        if cutoff is not None and subscriber.get("subscribed_at", 0) > cutoff:
            continue
        chat_id = str(subscriber.get("chat_id") or "")
        pref = subscriber.get("preference", "all")
        allowed = pref == "all" or pref == "top_college" and event.get("is_top_college") or pref == "internships" and event.get("is_internship")
        if chat_id and chat_id not in seen and allowed:
            seen.add(chat_id)
            yield chat_id


def expand_intents(database, lease, limit=100):
    expanded = 0
    for event in database.hackathons.find({"_notification_intents.0": {"$exists": True}}).limit(limit):
        for intent in event.get("_notification_intents", []):
            if lifecycle_values(event)["is_past"] or event.get("publication_state") == "suppressed":
                database.hackathons.update_one({"_id": event["_id"]}, {"$pull": {"_notification_intents": {"key": intent["key"]}}})
                continue
            for chat_id in recipients(database, intent["event"], intent.get("created_at")):
                lease.assert_owned()
                database.notification_deliveries.update_one({"delivery_key": _key(intent, chat_id)}, {"$setOnInsert": {
                    "delivery_key": _key(intent, chat_id), "event_id": event["_id"], "intent_key": intent["key"],
                    "kind": intent["kind"], "revision": intent["revision"], "chat_id": chat_id,
                    "event": intent["event"], "state": "pending", "attempts": 0,
                    "created_at": datetime.now(timezone.utc), "next_attempt_at": datetime.now(timezone.utc),
                }}, upsert=True)
            lease.assert_owned()
            database.hackathons.update_one({"_id": event["_id"]}, {"$pull": {"_notification_intents": {"key": intent["key"]}}})
            expanded += 1
    return expanded


def send_delivery(delivery):
    from notifier import telegram_bot as bot
    if not bot.TELEGRAM_BOT_TOKEN:
        return {"state": "pending", "retry_after": 60, "reason": "not_configured"}
    if delivery["kind"] == "health":
        text = "<b>Scraper health warning</b>\n" + bot._escape_html(delivery["source"]) + ": three consecutive failed or unconfirmed scans. Review scan history."
        keyboard = None
    else:
        event = delivery["event"]
        # Keep valid HTML intact; a blind character cut can split an HTML tag.
        display = {**event, "link": ""}
        for key, budget in {"title": 300, "deadline": 100, "source": 100, "location": 200, "prize": 250, "college_name": 150}.items():
            display[key] = str(event.get(key) or ("Unknown" if key == "source" else "TBA" if key == "deadline" else ""))[:budget]
        display["tags"] = [str(tag)[:40] for tag in (event.get("tags") or [])[:5]]
        text = bot._format_message(display).replace("🔗 Link not available", "").rstrip()
        if delivery["kind"] == "deadline":
            text = text.replace("New Hackathon Alert!", "Registration deadline updated", 1)
        keyboard = [[{"text": "Register / view source", "url": event["link"]}], [{"text": "View in web app", "url": bot.WEBAPP_URL}]]
    payload = {"chat_id": delivery["chat_id"], "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}
    if keyboard:
        payload["reply_markup"] = {"inline_keyboard": keyboard}
    try:
        response = requests.post(bot._API_URL, json=payload, timeout=15)
        body = response.json()
        if response.status_code == 200 and body.get("ok"):
            return {"state": "sent", "message_id": body.get("result", {}).get("message_id")}
        if response.status_code == 429:
            try:
                delay = max(1, min(86400, int(body.get("parameters", {}).get("retry_after", 60))))
            except (ValueError, TypeError):
                delay = 60
            return {"state": "pending", "retry_after": delay, "reason": "rate_limited"}
        if response.status_code in (400, 401, 403, 404):
            return {"state": "failed", "reason": "recipient_or_configuration_rejected"}
        return {"state": "uncertain", "reason": "server_response_uncertain"}
    except (requests.RequestException, ValueError):
        return {"state": "uncertain", "reason": "delivery_outcome_unknown"}


def process_deliveries(database, *, sender=None, limit=50, pace=True):
    from notifier.telegram_bot import TELEGRAM_CHAT_ID
    sender = sender or send_delivery
    now = datetime.now(timezone.utc)
    summary = {"sent": 0, "failed": 0, "uncertain": 0, "pending": 0}
    with JobLease(database.job_leases, name="telegram-delivery") as lease:
        # A crashed worker may already have delivered these messages. Do not replay.
        database.notification_deliveries.update_many({"state": "sending", "claimed_until": {"$lte": now}}, {"$set": {"state": "uncertain", "reason": "worker_stopped_during_send"}})
        expand_intents(database, lease)
        throttle = database.delivery_state.find_one({"_id": "telegram"}) or {}
        paused_until = throttle.get("paused_until")
        if paused_until and paused_until.replace(tzinfo=timezone.utc) > now:
            return summary
        for _ in range(limit):
            lease.assert_owned()
            now = datetime.now(timezone.utc)
            delivery = database.notification_deliveries.find_one_and_update({"state": "pending", "next_attempt_at": {"$lte": now}},
                {"$set": {"state": "sending", "owner": lease.owner, "claimed_until": now + timedelta(seconds=60)}, "$inc": {"attempts": 1}},
                sort=[("next_attempt_at", 1)], return_document=ReturnDocument.AFTER)
            if not delivery:
                break
            current = database.hackathons.find_one({"_id": delivery.get("event_id")})
            sub = database.subscribers.find_one({"chat_id": delivery["chat_id"], "is_active": True})
            pref = sub.get("preference", "all") if sub else None
            eligible = delivery["chat_id"] == str(TELEGRAM_CHAT_ID) or pref == "all" or pref == "top_college" and current and current.get("is_top_college") or pref == "internships" and current and current.get("is_internship")
            health = delivery["kind"] == "health" and delivery["chat_id"] == str(TELEGRAM_CHAT_ID)
            previous_send = database.notification_deliveries.find_one({"event_id": delivery.get("event_id"), "chat_id": delivery["chat_id"], "state": "sent"}, sort=[("delivered_revision", -1)]) if delivery["kind"] == "deadline" else None
            if not health and (not current or lifecycle_values(current)["is_past"] or current.get("publication_state") == "suppressed" or not eligible):
                result = {"state": "failed", "reason": "no_longer_eligible"}
            elif delivery["kind"] == "deadline" and (not previous_send or previous_send.get("delivered_revision", -1) >= current.get("revision", 0)):
                result = {"state": "failed", "reason": "superseded_or_no_previous_delivery"}
            elif delivery["attempts"] > 8:
                result = {"state": "failed", "reason": "retry_budget_exhausted"}
            else:
                if current and delivery["kind"] != "health":
                    # Queued sends use the latest confirmed facts, including a
                    # corrected deadline, rather than an obsolete event snapshot.
                    delivery["event"] = {key: current.get(key) for key in ("title", "link", "deadline", "deadline_iso", "source", "mode", "location", "prize", "tags", "is_top_college", "is_internship", "college_name", "college_type", "min_team_size", "max_team_size")}
                lease.assert_owned()
                try:
                    result = sender(delivery)
                except Exception:
                    result = {"state": "uncertain", "reason": "delivery_outcome_unknown"}
            state = result.get("state", "uncertain")
            if state not in summary:
                state = "uncertain"
            update = {"state": state, "reason": result.get("reason"), "message_id": result.get("message_id"), "finished_at": datetime.now(timezone.utc)}
            if current and state == "sent":
                update["delivered_revision"] = current.get("revision", 0)
                update["event"] = delivery["event"]
            if state == "pending":
                update["next_attempt_at"] = datetime.now(timezone.utc) + timedelta(seconds=result.get("retry_after", 60))
            # Check the claim too: a lost owner cannot overwrite later bookkeeping.
            mutation = {"$set": update}
            if result.get("reason") == "not_configured":
                mutation["$inc"] = {"attempts": -1}
            database.notification_deliveries.update_one({"_id": delivery["_id"], "state": "sending", "owner": lease.owner}, mutation)
            if result.get("reason") == "rate_limited":
                database.delivery_state.update_one({"_id": "telegram"}, {"$set": {"paused_until": update["next_attempt_at"]}}, upsert=True)
            if state == "sent" and current:
                database.hackathons.update_one({"_id": delivery["event_id"]}, {"$set": {"notified": True, "notified_at": datetime.now(timezone.utc).isoformat()}})
            summary[state] += 1
            if pace:
                time.sleep(1.1)
            if result.get("reason") in {"not_configured", "rate_limited"}:
                break
    return summary


def run_worker():
    from db.mongo_client import get_collection
    while True:
        try:
            collection = get_collection()
            if collection is not None:
                from ingestion import ensure_indexes
                ensure_indexes(collection.database)
                process_deliveries(collection.database)
        except Exception:
            # Never print a Telegram token or a private delivery document.
            import logging
            logging.getLogger(__name__).exception("Notification worker cycle failed")
        time.sleep(15)
