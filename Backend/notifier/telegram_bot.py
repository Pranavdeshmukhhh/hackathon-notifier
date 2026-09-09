"""
telegram_bot.py — Industry-grade Hackathon Notification Bot.

Public API
──────────
  send_notification(hackathon, *, session=None) -> bool
  send_batch(hackathon_list)                    -> dict
  start_polling()                               -> None   (blocking)

Design notes
────────────
• All text uses Telegram HTML parse_mode for rich formatting.
• Retry logic: tenacity exponential back-off on 429 / 5xx only.
• A single requests.Session is shared per send_batch() call.
• start_polling() uses telebot.infinity_polling() (thread-safe).
• Commands support inline keyboards for a polished UX.
"""

import logging
import os
import time
from pathlib import Path
from typing import Optional

import requests
import telebot
from telebot import types
from dotenv import load_dotenv
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
    RetryError,
)

# ── Load credentials ──────────────────────────────────────────────────────────
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID:   str = os.getenv("TELEGRAM_CHAT_ID",   "")
WEBAPP_URL:         str = os.getenv("WEBAPP_URL", "https://hackathon-notifier.vercel.app")

logger = logging.getLogger(__name__)

if not TELEGRAM_BOT_TOKEN:
    logger.warning("TELEGRAM_BOT_TOKEN not set — update Backend/.env")
if not TELEGRAM_CHAT_ID:
    logger.warning("TELEGRAM_CHAT_ID not set — update Backend/.env")

# ── Constants ─────────────────────────────────────────────────────────────────
_API_URL        = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
MESSAGE_DELAY_S = 1.5    # Telegram soft limit is ~30 msg/s; 1.5 s is safe
REQUEST_TIMEOUT = 10


# ── Helpers ───────────────────────────────────────────────────────────────────

def _escape(text) -> str:
    """Escape &, < and > for Telegram HTML parse mode."""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _deadline_urgency(deadline: str) -> str:
    """Return a visual urgency indicator based on deadline proximity."""
    import re
    from datetime import datetime

    # Try to extract a date from a freeform deadline string like "Starts 31/Jan/2025"
    patterns = [
        r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})",   # DD/MM/YYYY or MM/DD/YYYY
        r"(\d{4})-(\d{2})-(\d{2})",                 # ISO YYYY-MM-DD
    ]
    now = datetime.utcnow()
    for pat in patterns:
        m = re.search(pat, str(deadline))
        if m:
            try:
                g = m.groups()
                if len(g[0]) == 4:
                    d = datetime(int(g[0]), int(g[1]), int(g[2]))
                else:
                    d = datetime(int(g[2]) if len(g[2]) == 4 else 2000 + int(g[2]),
                                 int(g[1]), int(g[0]))
                days = (d - now).days
                if days < 0:   return "⚠️ Expired"
                if days == 0:  return "🔴 Today"
                if days <= 2:  return "🔴 Closing soon"
                if days <= 7:  return "🟡 This week"
                return "🟢 Open"
            except Exception:
                pass
    return ""


def _format_notification_message(h: dict) -> str:
    """
    Craft a rich HTML notification for push alerts (new hackathon discovered).
    Compact but information-dense — used by send_batch().
    """
    title    = h.get("title",    "Unknown Hackathon")
    deadline = h.get("deadline", "TBA")
    mode     = h.get("mode",     "Unknown")
    tags     = h.get("tags",     [])
    link     = h.get("link",     "")
    source   = h.get("source",   "Unknown")
    location = h.get("location", "")
    is_top   = h.get("is_top_college", False)
    college  = h.get("college_name")
    col_type = h.get("college_type")
    is_intern= h.get("is_internship", False)
    opp_type = h.get("opportunity_type", "Hackathon")
    regs     = h.get("total_registrations") or h.get("registrations")
    min_t    = h.get("min_team_size")
    max_t    = h.get("max_team_size")

    urgency  = _deadline_urgency(deadline)
    tags_str = " · ".join(f"#{t.replace(' ','')}" for t in tags[:5]) if tags else "—"

    # Badge line
    badges = []
    if is_top and college:
        badges.append(f"🏛 <b>{_escape(college)}</b> {f'({col_type})' if col_type else ''}")
    if is_intern:
        badges.append("💼 <b>Internship</b>")
    badge_line = "  ".join(badges)

    # Header
    msg = f"🚀 <b>New {_escape(opp_type)} Alert!</b>"
    if badge_line:
        msg += f"\n{badge_line}"
    msg += "\n\n"

    # Core details
    msg += f"📌 <b>{_escape(title)}</b>\n"
    msg += f"📅 Deadline: <code>{_escape(deadline)}</code>"
    if urgency:
        msg += f"  {urgency}"
    msg += "\n"
    msg += f"🌐 Mode: {_escape(mode)}\n"
    if location:
        msg += f"📍 Location: {_escape(location)}\n"
    msg += f"📡 Platform: {_escape(source)}\n"

    # Team & registrations
    if min_t or max_t:
        if min_t and max_t and min_t != max_t:
            msg += f"👤 Team size: {min_t}–{max_t}\n"
        else:
            msg += f"👤 Team size: {min_t or max_t}\n"
    if regs:
        if isinstance(regs, int):
            msg += f"👥 Registered: {regs:,}\n"
        else:
            msg += f"👥 Registered: {_escape(regs)}\n"

    msg += f"🏷️ {tags_str}\n\n"

    if link:
        msg += f'🔗 <a href="{link}">Register / View Details →</a>'
    else:
        msg += "🔗 Link not available"

    return msg


def _format_card(h: dict, idx: int | None = None, show_distance: bool = False) -> str:
    """
    Compact rich card for listing hackathons (used by /latest, /nearest, etc.).
    """
    title    = h.get("title", "Unknown")
    deadline = h.get("deadline", "TBA")
    mode     = h.get("mode", "—")
    link     = h.get("link", "")
    location = h.get("location", "")
    source   = h.get("source", "")
    is_top   = h.get("is_top_college", False)
    college  = h.get("college_name", "")
    is_intern= h.get("is_internship", False)
    regs     = h.get("total_registrations") or h.get("registrations")
    min_t    = h.get("min_team_size")
    max_t    = h.get("max_team_size")
    dist     = h.get("distance_km")
    urgency  = _deadline_urgency(deadline)

    prefix = f"{idx}. " if idx else ""
    title_link = f'<a href="{link}">{_escape(title)}</a>' if link else _escape(title)
    line = f"{prefix}<b>{title_link}</b>\n"

    badges = []
    if is_top and college:  badges.append(f"🏛 {_escape(college)}")
    if is_intern:           badges.append("💼 Internship")
    if badges:
        line += " · ".join(badges) + "\n"

    line += f"📅 {_escape(deadline)}"
    if urgency: line += f"  {urgency}"
    line += "\n"
    line += f"🌐 {_escape(mode)}"
    if location: line += f"  ·  📍 {_escape(location)}"
    line += "\n"

    if show_distance and dist is not None:
        line += f"🗺️ <b>{dist} km away</b>\n"

    if regs:
        if isinstance(regs, int):
            line += f"👥 {regs:,} registered\n"
        else:
            line += f"👥 {_escape(str(regs))} registered\n"

    if min_t or max_t:
        if min_t and max_t and min_t != max_t:
            line += f"👤 Team: {min_t}–{max_t}\n"
        else:
            line += f"👤 Team: {min_t or max_t}\n"

    if source:
        line += f"📡 {_escape(source)}\n"

    return line.strip()


# ── Core send ─────────────────────────────────────────────────────────────────

class _TelegramRetryable(Exception):
    """Raised to trigger tenacity retry on transient failures."""


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception_type(_TelegramRetryable),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=False,
)
def _do_send(requester, payload: dict, title: str) -> bool:
    resp = requester.post(_API_URL, json=payload, timeout=REQUEST_TIMEOUT)

    if resp.status_code == 200 and resp.json().get("ok"):
        logger.info("Telegram OK: %s", title)
        return True

    if resp.status_code == 429:
        retry_after = resp.json().get("parameters", {}).get("retry_after", 5)
        logger.warning("Telegram 429 — waiting %ds for '%s'.", retry_after, title)
        time.sleep(retry_after)
        raise _TelegramRetryable(f"429 (retry_after={retry_after}s)")

    if resp.status_code in (500, 502, 503, 504):
        raise _TelegramRetryable(f"Server error HTTP {resp.status_code}")

    logger.error("Telegram error (HTTP %d): %s", resp.status_code, resp.text[:200])
    return False


def send_notification(hackathon: dict, *, session: Optional[requests.Session] = None) -> bool:
    """
    Send a single hackathon push notification to the configured Telegram chat.

    Returns True on success, False on any failure. Never raises.
    """
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        logger.error("Telegram credentials missing.")
        return False
    if not hackathon:
        return False

    payload = {
        "chat_id":                  TELEGRAM_CHAT_ID,
        "text":                     _format_notification_message(hackathon),
        "parse_mode":               "HTML",
        "disable_web_page_preview": False,
    }
    requester = session or requests
    title = hackathon.get("title", "?")

    try:
        return _do_send(requester, payload, title) or False
    except RetryError:
        logger.error("All retries exhausted for '%s'.", title)
    except requests.exceptions.Timeout:
        logger.error("Telegram timeout for: %s", title)
    except requests.exceptions.ConnectionError:
        logger.error("Telegram connection error for: %s", title)
    except requests.exceptions.RequestException:
        logger.exception("Telegram request failed for: %s", title)
    except Exception:
        logger.exception("Unexpected error sending notification.")
    return False


def send_batch(hackathon_list: list[dict]) -> dict:
    """
    Send notifications for multiple hackathons using a shared Session.
    Spaces messages MESSAGE_DELAY_S apart to respect rate limits.

    Returns: {"total": int, "sent": int, "failed": int}
    """
    total = len(hackathon_list) if hackathon_list else 0
    if not hackathon_list:
        return {"total": 0, "sent": 0, "failed": 0}

    logger.info("send_batch: %d notifications…", total)
    sent = failed = 0

    with requests.Session() as session:
        for i, h in enumerate(hackathon_list, start=1):
            logger.info("  [%d/%d] %s", i, total, h.get("title", "?"))
            if send_notification(h, session=session):
                sent += 1
            else:
                failed += 1
            if i < total:
                time.sleep(MESSAGE_DELAY_S)

    logger.info("send_batch done: %d/%d sent, %d failed.", sent, total, failed)
    return {"total": total, "sent": sent, "failed": failed}


# ── Bot Listener ──────────────────────────────────────────────────────────────

def start_polling():
    """
    Start the Telegram command bot using long-polling.
    Blocking — run in a background thread (see unified_server.py).

    Commands
    ─────────
    /start  /help     — Welcome + command list
    /latest           — 5 most recently added upcoming hackathons
    /top              — Top College (IIT/NIT/BITS) hackathons
    /internships      — Upcoming internship opportunities
    /online           — Online-only hackathons
    /offline          — Offline hackathons (requires location for /nearest)
    /nearest          — Prompt for location, then show nearest 5 offline events
    /stats            — Live platform statistics
    """
    if not TELEGRAM_BOT_TOKEN:
        logger.error("No TELEGRAM_BOT_TOKEN, cannot start polling.")
        return

    bot = telebot.TeleBot(TELEGRAM_BOT_TOKEN, threaded=True)

    def _get_data(**kwargs):
        """Fetch hackathons from the API layer (no HTTP round-trip)."""
        import api
        return api.get_hackathons(request=None, **kwargs)

    def _make_main_keyboard():
        """Persistent reply keyboard with the most common commands."""
        kb = types.ReplyKeyboardMarkup(resize_keyboard=True, row_width=3)
        kb.add(
            types.KeyboardButton("🔥 Latest"),
            types.KeyboardButton("🏛 Top College"),
            types.KeyboardButton("💼 Internships"),
        )
        kb.add(
            types.KeyboardButton("🌐 Online"),
            types.KeyboardButton("📍 Offline"),
            types.KeyboardButton("📊 Stats"),
        )
        kb.add(types.KeyboardButton("📍 Near Me (share location)", request_location=True))
        return kb

    def _send_list(bot, message, hackathons: list, header: str, show_distance: bool = False):
        """Helper: send a paginated list of hackathon cards."""
        if not hackathons:
            bot.reply_to(message, "😕 No results found right now. Try again later!", reply_markup=_make_main_keyboard())
            return

        # Send header
        bot.reply_to(message, header, parse_mode="HTML")

        # Send each card as its own message so they don't exceed 4096 chars
        for i, h in enumerate(hackathons, start=1):
            card = _format_card(h, idx=i, show_distance=show_distance)
            link = h.get("link", "")
            markup = None
            if link:
                markup = types.InlineKeyboardMarkup()
                markup.add(types.InlineKeyboardButton("Register / Details →", url=link))
            try:
                bot.send_message(message.chat.id, card, parse_mode="HTML",
                                 disable_web_page_preview=True, reply_markup=markup)
                time.sleep(0.4)  # avoid flooding
            except Exception:
                logger.exception("Failed to send card %d", i)

        # Footer with main keyboard
        bot.send_message(
            message.chat.id,
            f"✅ Showing {len(hackathons)} result(s). Use the buttons below for more.",
            reply_markup=_make_main_keyboard()
        )

    # ── /start  /help ──────────────────────────────────────────────────────────
    @bot.message_handler(commands=["start", "help"])
    def handle_start(message):
        logger.info("/%s from @%s", message.text.lstrip("/").split()[0], message.from_user.username)
        text = (
            "⚡ <b>Hackathon Notifier</b>\n\n"
            "Your personal hackathon feed, powered by real-time scraping.\n\n"
            "<b>Commands</b>\n"
            "🔥 /latest        — 5 newest upcoming hackathons\n"
            "🏛 /top           — IIT / NIT / BITS hackathons\n"
            "💼 /internships   — Upcoming internship listings\n"
            "🌐 /online        — Online-only hackathons\n"
            "📍 /offline       — Offline hackathons\n"
            "🗺️ /nearest       — Offline events near you (needs location)\n"
            "📊 /stats         — Live platform statistics\n\n"
            f'<a href="{WEBAPP_URL}">🌍 Open Web App →</a>'
        )
        bot.reply_to(message, text, parse_mode="HTML",
                     disable_web_page_preview=True,
                     reply_markup=_make_main_keyboard())

    # ── /latest ────────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["latest"])
    @bot.message_handler(func=lambda m: m.text and m.text.strip() == "🔥 Latest")
    def handle_latest(message):
        logger.info("/latest from @%s", message.from_user.username)
        bot.send_chat_action(message.chat.id, "typing")
        res  = _get_data()
        docs = [d for d in res.get("data", []) if not d.get("is_past")]
        _send_list(bot, message, docs[:5], "🔥 <b>5 Latest Upcoming Hackathons</b>")

    # ── /top ───────────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["top"])
    @bot.message_handler(func=lambda m: m.text and m.text.strip() == "🏛 Top College")
    def handle_top(message):
        logger.info("/top from @%s", message.from_user.username)
        bot.send_chat_action(message.chat.id, "typing")
        res  = _get_data()
        docs = [d for d in res.get("data", []) if d.get("is_top_college") and not d.get("is_past")]
        _send_list(bot, message, docs[:5], "🏛 <b>Top College Events (IIT / NIT / BITS)</b>")

    # ── /internships ───────────────────────────────────────────────────────────
    @bot.message_handler(commands=["internships"])
    @bot.message_handler(func=lambda m: m.text and m.text.strip() == "💼 Internships")
    def handle_internships(message):
        logger.info("/internships from @%s", message.from_user.username)
        bot.send_chat_action(message.chat.id, "typing")
        res  = _get_data()
        docs = [d for d in res.get("data", []) if d.get("is_internship") and not d.get("is_past")]
        _send_list(bot, message, docs[:5], "💼 <b>Upcoming Internship Opportunities</b>")

    # ── /online ────────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["online"])
    @bot.message_handler(func=lambda m: m.text and m.text.strip() == "🌐 Online")
    def handle_online(message):
        logger.info("/online from @%s", message.from_user.username)
        bot.send_chat_action(message.chat.id, "typing")
        res  = _get_data()
        docs = [d for d in res.get("data", [])
                if not d.get("is_past") and "online" in (d.get("mode") or "").lower()]
        _send_list(bot, message, docs[:5], "🌐 <b>Online Hackathons</b>")

    # ── /offline ───────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["offline"])
    @bot.message_handler(func=lambda m: m.text and m.text.strip() == "📍 Offline")
    def handle_offline(message):
        logger.info("/offline from @%s", message.from_user.username)
        bot.send_chat_action(message.chat.id, "typing")
        res  = _get_data()
        docs = [d for d in res.get("data", [])
                if not d.get("is_past") and "offline" in (d.get("mode") or "").lower()]
        _send_list(bot, message, docs[:5], "📍 <b>Offline Hackathons</b>")

    # ── /stats ─────────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["stats"])
    @bot.message_handler(func=lambda m: m.text and m.text.strip() == "📊 Stats")
    def handle_stats(message):
        logger.info("/stats from @%s", message.from_user.username)
        bot.send_chat_action(message.chat.id, "typing")
        res   = _get_data()
        s     = res.get("stats", {})
        upcoming = res.get("upcoming_total", 0)
        missed   = res.get("missed_total",   0)

        text = (
            "📊 <b>Live Platform Statistics</b>\n\n"
            f"🎯 Total Opportunities: <b>{s.get('total', 0)}</b>\n"
            f"🚀 Upcoming: <b>{upcoming}</b>\n"
            f"📁 Missed: <b>{missed}</b>\n\n"
            f"🏛 IIT/NIT/BITS events: <b>{s.get('top_college_count', 0)}</b>\n"
            f"💼 Internships: <b>{s.get('internship_count', 0)}</b>\n"
            f"🌐 Online: <b>{s.get('online_count', 0)}</b>\n"
            f"📍 Offline: <b>{s.get('offline_count', 0)}</b>\n"
            f"⭐ Curated sources: <b>{s.get('unique_sources_count', 0)}</b>\n"
            f"🏷️ Unique tags: <b>{s.get('unique_tags', 0)}</b>\n\n"
            f'<a href="{WEBAPP_URL}">🌍 Full Dashboard →</a>'
        )
        bot.reply_to(message, text, parse_mode="HTML",
                     disable_web_page_preview=True,
                     reply_markup=_make_main_keyboard())

    # ── /nearest ───────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["nearest"])
    def handle_nearest(message):
        logger.info("/nearest from @%s", message.from_user.username)
        kb = types.ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True, row_width=1)
        kb.add(types.KeyboardButton("📍 Share My Location", request_location=True))
        kb.add(types.KeyboardButton("❌ Cancel"))
        bot.reply_to(message,
                     "📍 <b>Find offline hackathons near you</b>\n\n"
                     "Tap the button below to share your location. "
                     "Works best on mobile Telegram.",
                     parse_mode="HTML",
                     reply_markup=kb)

    # ── Location handler ───────────────────────────────────────────────────────
    @bot.message_handler(content_types=["location"])
    def handle_location(message):
        logger.info("Location received from @%s", message.from_user.username)
        lat = message.location.latitude
        lng = message.location.longitude

        bot.send_chat_action(message.chat.id, "find_location")
        bot.send_message(message.chat.id, "📡 Calculating distances…", reply_markup=types.ReplyKeyboardRemove())

        res  = _get_data(lat=lat, lng=lng)
        docs = res.get("data", [])

        nearby = [
            d for d in docs
            if not d.get("is_past")
            and "distance_km" in d
            and (d.get("mode") or "").lower() in ("offline", "hybrid")
        ]
        nearby.sort(key=lambda d: d.get("distance_km", 999_999))

        _send_list(bot, message, nearby[:5],
                   f"🗺️ <b>Nearest Offline Hackathons</b> (from {lat:.3f}, {lng:.3f})",
                   show_distance=True)

    # ── Cancel ─────────────────────────────────────────────────────────────────
    @bot.message_handler(func=lambda m: m.text and m.text.strip() == "❌ Cancel")
    def handle_cancel(message):
        bot.reply_to(message, "Cancelled.", reply_markup=_make_main_keyboard())

    # ── Fallback ───────────────────────────────────────────────────────────────
    @bot.message_handler(func=lambda m: True)
    def handle_unknown(message):
        bot.reply_to(
            message,
            "🤔 I didn't understand that. Use /help to see available commands.",
            reply_markup=_make_main_keyboard()
        )

    logger.info("Telegram bot polling started.")
    try:
        bot.infinity_polling(timeout=30, long_polling_timeout=25)
    except Exception:
        logger.exception("Polling stopped unexpectedly.")


# ── Self-test ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
                        stream=sys.stdout)

    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("ERROR: Telegram credentials missing — set in Backend/.env")
        sys.exit(1)

    test_hack = {
        "title":            "Test Hackathon — Please Ignore",
        "deadline":         "Starts 01/01/27",
        "mode":             "Online",
        "tags":             ["AI", "Web3", "Test"],
        "link":             "https://devfolio.co/hackathons",
        "source":           "Test Script",
        "is_top_college":   True,
        "college_type":     "IIT",
        "college_name":     "IIT Bombay",
        "is_internship":    False,
        "opportunity_type": "Hackathon",
        "location":         "Mumbai, India",
        "total_registrations": 12_450,
        "min_team_size":    2,
        "max_team_size":    4,
    }
    ok = send_notification(test_hack)
    print("Result:", "PASS — check Telegram!" if ok else "FAIL — check logs.")
    sys.exit(0 if ok else 1)
