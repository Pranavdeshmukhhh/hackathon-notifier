"""
telegram_bot.py — Industry-Grade Interactive Hackathon Notification Bot.

Public API
──────────
  send_notification(hackathon, *, session=None, chat_id=None) -> bool
  send_batch(hackathon_list)                                   -> dict
  start_polling()                                              -> None (blocking daemon)
  _format_message(hackathon)                                   -> str
  _escape_html(text)                                           -> str

Key Capabilities:
─────────────────
• Multi-subscriber push notifications with preference filtering (All / Top College / Internships).
• Interactive Inline Keyboard Browsing & Pagination (prev/next in-place message editing).
• Full Real-Time Keyword Search (/search <query>) & natural text query handling.
• Platform-specific commands (/devfolio, /unstop, /devpost, /devnovate, /hackerearth).
• Urgency (/closing_soon) & High Prize (/prizes) rankings.
• Haversine GPS proximity with direct Google Maps route links.
• Admin suite (/scrape_now, /broadcast, /subscribers) restricted to TELEGRAM_CHAT_ID.
• Native Telegram command menu auto-registration (bot.set_my_commands).
• Tenacity exponential backoff with 429 rate limit handling.
"""

import json
import logging
import math
import os
import re
import sys
import threading
import time
from datetime import datetime
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

TELEGRAM_API_BASE:  str = os.getenv("TELEGRAM_API_BASE", "https://api.telegram.org").rstrip("/")
_API_URL            = f"{TELEGRAM_API_BASE}/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
MESSAGE_DELAY_S     = 1.5    # Telegram soft limit is ~30 msg/s; 1.5s is safe for batches
REQUEST_TIMEOUT     = 10
PAGE_SIZE           = 3      # Number of hackathon cards per interactive page


# ── Formatting & Escape Helpers ───────────────────────────────────────────────

def _escape_html(text) -> str:
    """Escape &, < and > for Telegram HTML parse mode. Handles non-string input safely."""
    if text is None:
        return ""
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# Alias for backward compatibility
_escape = _escape_html


def _deadline_urgency(deadline: str) -> str:
    """Return a visual urgency indicator based on deadline proximity."""
    patterns = [
        r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})",   # DD/MM/YYYY or MM/DD/YYYY
        r"(\d{4})-(\d{2})-(\d{2})",                 # ISO YYYY-MM-DD
    ]
    from datetime import timezone
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for pat in patterns:
        m = re.search(pat, str(deadline))
        if m:
            try:
                g = m.groups()
                if len(g[0]) == 4:
                    d = datetime(int(g[0]), int(g[1]), int(g[2]))
                else:
                    year = int(g[2])
                    if year < 100:
                        year += 2000
                    d = datetime(year, int(g[1]), int(g[0]))
                days = (d - now).days
                if days < 0:   return "⚠️ Expired"
                if days == 0:  return "🔴 Closing Today"
                if days <= 2:  return f"🔴 Closing in {days}d"
                if days <= 7:  return f"🟡 {days}d left"
                return "🟢 Open"
            except Exception:
                pass
    return ""


def _is_closing_soon(deadline: str) -> bool:
    """Check if deadline is within 3 days."""
    urg = _deadline_urgency(deadline)
    return "Closing" in urg or "Today" in urg or "1d" in urg or "2d" in urg or "3d" in urg


def _format_message(h: dict) -> str:
    """
    Craft a rich HTML notification message.
    Preserves all field tests in test_telegram.py.
    """
    title     = h.get("title",    "Unknown Hackathon")
    deadline  = h.get("deadline", "TBA")
    mode      = h.get("mode",     "Unknown")
    tags      = h.get("tags",     [])
    link      = h.get("link",     "")
    source    = h.get("source",   "Unknown")
    location  = h.get("location", "")
    is_top    = h.get("is_top_college", False)
    college   = h.get("college_name")
    col_type  = h.get("college_type")
    is_intern = h.get("is_internship", False)
    opp_type  = h.get("opportunity_type", "Hackathon")
    regs      = h.get("total_registrations") or h.get("registrations")
    min_t     = h.get("min_team_size")
    max_t     = h.get("max_team_size")
    prize     = h.get("prize", "")

    urgency   = _deadline_urgency(deadline)
    tags_str  = " · ".join(f"#{t.replace(' ','')}" for t in tags[:5]) if tags else "—"

    badges = []
    if is_top and college:
        badges.append(f"🏛 <b>{_escape_html(college)}</b> {f'({col_type})' if col_type else ''}")
    if is_intern:
        badges.append("💼 <b>Internship</b>")
    badge_line = "  ".join(badges)

    # Header
    msg = f"🚀 <b>New {_escape_html(opp_type)} Alert!</b>"
    if badge_line:
        msg += f"\n{badge_line}"
    msg += "\n\n"

    # Details
    msg += f"📌 <b>{_escape_html(title)}</b>\n"
    msg += f"📅 Deadline: <code>{_escape_html(deadline)}</code>"
    if urgency:
        msg += f"  {urgency}"
    msg += "\n"
    msg += f"🌐 Mode: {_escape_html(mode)}\n"
    if location:
        msg += f"📍 Location: {_escape_html(location)}\n"
    if prize:
        msg += f"🏆 Prize: <b>{_escape_html(prize)}</b>\n"
    msg += f"📡 Platform: {_escape_html(source)}\n"

    if min_t or max_t:
        if min_t and max_t and min_t != max_t:
            msg += f"👤 Team size: {min_t}–{max_t}\n"
        else:
            msg += f"👤 Team size: {min_t or max_t}\n"
    if regs:
        if isinstance(regs, int):
            msg += f"👥 Registered: {regs:,}\n"
        else:
            msg += f"👥 Registered: {_escape_html(regs)}\n"

    msg += f"🏷️ {tags_str}\n\n"

    if link:
        msg += f'🔗 <a href="{link}">Register / View Details →</a>'
    else:
        msg += "🔗 Link not available"

    return msg


# Alias for internal use
_format_notification_message = _format_message


def _format_card(h: dict, idx: int | None = None, show_distance: bool = False) -> str:
    """Compact rich card for displaying individual listings in search / browse."""
    title     = h.get("title", "Unknown")
    deadline  = h.get("deadline", "TBA")
    mode      = h.get("mode", "—")
    link      = h.get("link", "")
    location  = h.get("location", "")
    source    = h.get("source", "")
    is_top    = h.get("is_top_college", False)
    college   = h.get("college_name", "")
    is_intern = h.get("is_internship", False)
    regs      = h.get("total_registrations") or h.get("registrations")
    prize     = h.get("prize", "")
    dist      = h.get("distance_km")
    urgency   = _deadline_urgency(deadline)

    prefix = f"<b>#{idx}</b> " if idx else ""
    title_link = f'<a href="{link}">{_escape_html(title)}</a>' if link else _escape_html(title)
    line = f"{prefix}<b>{title_link}</b>\n"

    badges = []
    if is_top and college:
        badges.append(f"🏛 {_escape_html(college)}")
    if is_intern:
        badges.append("💼 Internship")
    if badges:
        line += " · ".join(badges) + "\n"

    line += f"📅 <code>{_escape_html(deadline)}</code>"
    if urgency:
        line += f"  {urgency}"
    line += f"  ·  🌐 {_escape_html(mode)}\n"

    if location:
        line += f"📍 {_escape_html(location)}\n"
    if show_distance and dist is not None:
        line += f"🗺️ <b>{dist} km away</b>\n"
    if prize:
        line += f"🏆 Prize: <b>{_escape_html(prize)}</b>\n"
    if regs:
        reg_str = f"{regs:,}" if isinstance(regs, int) else _escape_html(str(regs))
        line += f"👥 {reg_str} registered  ·  "
    line += f"📡 {_escape_html(source)}\n"

    return line.strip()


# ── Core Network Send ─────────────────────────────────────────────────────────

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

    if resp.status_code == 403:
        logger.warning("Telegram 403: User blocked bot or invalid chat.")
        return False

    logger.error("Telegram error (HTTP %d): %s", resp.status_code, resp.text[:200])
    return False


def send_notification(
    hackathon: dict,
    *,
    session: Optional[requests.Session] = None,
    chat_id: Optional[str] = None
) -> bool:
    """
    Send a single hackathon push notification with inline buttons.
    Defaults to TELEGRAM_CHAT_ID if chat_id is not specified.
    """
    target_chat = chat_id or TELEGRAM_CHAT_ID
    if not TELEGRAM_BOT_TOKEN or not target_chat:
        logger.error("Telegram credentials missing.")
        return False
    if not hackathon:
        return False

    # Attach interactive inline keyboard to the push notification
    inline_buttons = []
    link = hackathon.get("link")
    if link:
        inline_buttons.append([{"text": "🚀 Register / Apply →", "url": link}])

    webapp_row = [{"text": "🌐 View in Web App", "url": WEBAPP_URL}]
    if hackathon.get("lat") and hackathon.get("lng"):
        webapp_row.append({
            "text": "📍 Google Maps",
            "url": f"https://www.google.com/maps/search/?api=1&query={hackathon['lat']},{hackathon['lng']}"
        })
    inline_buttons.append(webapp_row)

    payload = {
        "chat_id":                  str(target_chat),
        "text":                     _format_message(hackathon),
        "parse_mode":               "HTML",
        "disable_web_page_preview": False,
        "reply_markup":             {"inline_keyboard": inline_buttons},
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
    Send notifications for multiple hackathons to all active subscribers
    and the default TELEGRAM_CHAT_ID using a shared Session.
    """
    total = len(hackathon_list) if hackathon_list else 0
    if not hackathon_list:
        return {"total": 0, "sent": 0, "failed": 0}

    logger.info("send_batch: %d notifications…", total)
    sent = failed = 0

    # Retrieve active subscribers from MongoDB if available
    subscribers = []
    try:
        from db.mongo_client import get_active_subscribers
        subscribers = get_active_subscribers()
    except Exception as e:
        logger.warning("Could not fetch subscribers from DB: %s", e)

    # Compile list of recipient chat IDs
    subscriber_map = {}
    for sub in subscribers:
        cid = str(sub.get("chat_id", "")).strip()
        if cid:
            subscriber_map[cid] = sub.get("preference", "all")

    # Ensure default admin chat ID is included
    if TELEGRAM_CHAT_ID:
        subscriber_map[str(TELEGRAM_CHAT_ID)] = "all"

    with requests.Session() as session:
        for i, h in enumerate(hackathon_list, start=1):
            logger.info("  [%d/%d] %s", i, total, h.get("title", "?"))
            is_top = h.get("is_top_college", False)
            is_int = h.get("is_internship", False)

            # Check matching subscribers for this specific hackathon
            recipients = []
            for cid, pref in subscriber_map.items():
                if pref == "all":
                    recipients.append(cid)
                elif pref == "top_college" and is_top:
                    recipients.append(cid)
                elif pref == "internships" and is_int:
                    recipients.append(cid)

            if not recipients:
                recipients = [TELEGRAM_CHAT_ID] if TELEGRAM_CHAT_ID else []

            item_success = False
            for target_id in recipients:
                ok = send_notification(h, session=session, chat_id=target_id)
                if ok:
                    item_success = True

            if item_success:
                sent += 1
            else:
                failed += 1

            if i < total:
                time.sleep(MESSAGE_DELAY_S)

    logger.info("send_batch done: %d/%d sent, %d failed.", sent, total, failed)
    return {"total": total, "sent": sent, "failed": failed}


# ── Interactive Bot Listener ──────────────────────────────────────────────────

def start_polling():
    """
    Start the interactive Telegram Bot with long-polling in a background thread.
    """
    if not TELEGRAM_BOT_TOKEN:
        logger.error("No TELEGRAM_BOT_TOKEN, cannot start polling.")
        return

    if TELEGRAM_API_BASE != "https://api.telegram.org":
        telebot.apihelper.API_URL = f"{TELEGRAM_API_BASE}/bot{{0}}/{{1}}"

    bot = telebot.TeleBot(TELEGRAM_BOT_TOKEN, threaded=True)

    def _get_data(**kwargs):
        """Fetch hackathons from the API layer without network overhead."""
        try:
            import api
            return api.get_hackathons(request=None, **kwargs)
        except Exception as e:
            logger.exception("Error calling api.get_hackathons: %s", e)
            return {"data": [], "stats": {}, "total": 0}

    def _make_main_keyboard():
        """Persistent reply keyboard with core shortcuts."""
        kb = types.ReplyKeyboardMarkup(resize_keyboard=True, row_width=3)
        kb.add(
            types.KeyboardButton("🔥 Latest"),
            types.KeyboardButton("🏛 Top College"),
            types.KeyboardButton("💼 Internships"),
        )
        kb.add(
            types.KeyboardButton("🌐 Online"),
            types.KeyboardButton("📍 Offline"),
            types.KeyboardButton("🏆 Top Prizes"),
        )
        kb.add(
            types.KeyboardButton("⏳ Closing Soon"),
            types.KeyboardButton("🔔 Alerts"),
            types.KeyboardButton("📊 Stats"),
        )
        kb.add(types.KeyboardButton("📍 Near Me (Share Location)", request_location=True))
        return kb

    def _build_inline_markup(
        hackathons: list,
        page: int,
        total_pages: int,
        category: str,
        query: str = ""
    ) -> types.InlineKeyboardMarkup:
        """Create an interactive inline keyboard for pagination and direct actions."""
        markup = types.InlineKeyboardMarkup(row_width=3)

        # Direct action buttons for each hackathon displayed on this page
        link_row = []
        for i, h in enumerate(hackathons, start=1):
            lnk = h.get("link")
            if lnk:
                link_row.append(types.InlineKeyboardButton(f"#{i} Register 🚀", url=lnk))
        if link_row:
            markup.row(*link_row)

        # Pagination controls
        nav_row = []
        safe_q = (query or "")[:20].replace(":", "_")
        if page > 1:
            nav_row.append(
                types.InlineKeyboardButton("⬅️ Prev", callback_data=f"page:{category}:{page-1}:{safe_q}")
            )
        nav_row.append(
            types.InlineKeyboardButton(f"📄 {page}/{total_pages}", callback_data="noop")
        )
        if page < total_pages:
            nav_row.append(
                types.InlineKeyboardButton("Next ➡️", callback_data=f"page:{category}:{page+1}:{safe_q}")
            )
        markup.row(*nav_row)

        # Quick Category Filter Switchers
        markup.row(
            types.InlineKeyboardButton("🔥 Latest", callback_data="filter:latest"),
            types.InlineKeyboardButton("🏛 Top College", callback_data="filter:top"),
            types.InlineKeyboardButton("💼 Internships", callback_data="filter:internships"),
        )
        markup.row(
            types.InlineKeyboardButton("🌐 Online", callback_data="filter:online"),
            types.InlineKeyboardButton("🏆 Prizes", callback_data="filter:prizes"),
            types.InlineKeyboardButton("⏳ Soon", callback_data="filter:closing_soon"),
        )
        markup.row(types.InlineKeyboardButton("🌍 Open Web Dashboard →", url=WEBAPP_URL))

        return markup

    def _render_page(
        items: list,
        header: str,
        page: int = 1,
        category: str = "latest",
        query: str = "",
        show_distance: bool = False
    ) -> tuple[str, types.InlineKeyboardMarkup]:
        """Format an interactive paginated text and inline keyboard."""
        total_items = len(items)
        total_pages = max(1, math.ceil(total_items / PAGE_SIZE))
        page = max(1, min(page, total_pages))

        start_idx = (page - 1) * PAGE_SIZE
        page_items = items[start_idx : start_idx + PAGE_SIZE]

        text = f"{header}\n"
        text += f"<i>Page {page} of {total_pages} · {total_items} opportunity(ies) found</i>\n\n"

        for i, h in enumerate(page_items, start=start_idx + 1):
            text += _format_card(h, idx=i, show_distance=show_distance) + "\n\n"

        markup = _build_inline_markup(page_items, page, total_pages, category, query)
        return text.strip(), markup

    # ── Register Telegram Bot Menu Commands ───────────────────────────────────
    try:
        bot.set_my_commands([
            types.BotCommand("latest", "5 newest upcoming hackathons"),
            types.BotCommand("top", "IIT, NIT, and BITS college events"),
            types.BotCommand("internships", "Paid & student internship tracks"),
            types.BotCommand("online", "Online-only hackathons"),
            types.BotCommand("offline", "In-person hackathons"),
            types.BotCommand("nearest", "Find offline hackathons near you"),
            types.BotCommand("prizes", "Highest prize pool hackathons"),
            types.BotCommand("closing_soon", "Deadlines closing within 72 hours"),
            types.BotCommand("search", "Search hackathons by keyword"),
            types.BotCommand("subscribe", "Get automated live alerts"),
            types.BotCommand("settings", "Customize alert preferences"),
            types.BotCommand("stats", "Live platform ingestion stats"),
            types.BotCommand("help", "View full bot guide & commands"),
        ])
        logger.info("Telegram bot commands menu registered.")
    except Exception as e:
        logger.warning("Could not set bot commands: %s", e)

    # ── /start & /help ────────────────────────────────────────────────────────
    @bot.message_handler(commands=["start", "help"])
    def handle_start_help(message):
        chat_id = str(message.chat.id)
        user_info = {
            "username":   message.from_user.username,
            "first_name": message.from_user.first_name,
            "last_name":  message.from_user.last_name,
        }
        # Auto-enroll new users with default preferences
        try:
            from db.mongo_client import add_subscriber
            add_subscriber(chat_id, user_info, preference="all")
        except Exception:
            pass

        text = (
            "⚡ <b>Hackathon Notifier — Real-Time Developer Terminal</b>\n\n"
            "Automated continuous indexing across <b>Devfolio, Unstop, Devpost, HackerEarth, and Devnovate</b>.\n\n"
            "<b>🎯 Core Commands:</b>\n"
            "🔥 /latest — 5 newest upcoming hackathons\n"
            "🏛 /top — IIT / NIT / BITS hackathons\n"
            "💼 /internships — Internship opportunities\n"
            "🌐 /online — Online-only hackathons\n"
            "📍 /offline — In-person events\n"
            "🗺️ /nearest — Offline events near you (GPS)\n"
            "🏆 /prizes — Events with top prize pools\n"
            "⏳ /closing_soon — Deadlines closing in &lt; 72 hours\n"
            "🔍 /search &lt;keyword&gt; — Search hackathons (e.g. <code>/search web3</code>)\n\n"
            "<b>📡 Source Feeds:</b>\n"
            "/devfolio · /unstop · /devpost · /devnovate · /hackerearth\n\n"
            "<b>🔔 Notification Preferences:</b>\n"
            "/subscribe — Turn on real-time alerts\n"
            "/settings — Filter which alerts you receive\n"
            "/unsubscribe — Stop receiving alerts\n\n"
            f'🌍 <a href="{WEBAPP_URL}">Open Full Web App →</a>'
        )

        inline_kb = types.InlineKeyboardMarkup()
        inline_kb.row(
            types.InlineKeyboardButton("🔥 Browse Latest", callback_data="filter:latest"),
            types.InlineKeyboardButton("🏛 Top College", callback_data="filter:top"),
        )
        inline_kb.row(
            types.InlineKeyboardButton("🔔 Alert Settings", callback_data="open_settings"),
            types.InlineKeyboardButton("📊 Platform Stats", callback_data="filter:stats"),
        )
        inline_kb.row(types.InlineKeyboardButton("🌍 Open Web Dashboard →", url=WEBAPP_URL))

        bot.reply_to(message, text, parse_mode="HTML",
                     disable_web_page_preview=True,
                     reply_markup=_make_main_keyboard())
        bot.send_message(message.chat.id, "Quick navigation menu:", reply_markup=inline_kb)

    # ── Category Handlers ─────────────────────────────────────────────────────

    def _show_category(chat_id, category: str, reply_to_id: int | None = None):
        bot.send_chat_action(chat_id, "typing")
        res = _get_data(limit=100)
        docs = [d for d in res.get("data", []) if not d.get("is_past")]

        header = "🔥 <b>Latest Upcoming Opportunities</b>"
        items = docs

        if category == "top":
            header = "🏛 <b>Top College Hackathons (IIT / NIT / BITS)</b>"
            items = [d for d in docs if d.get("is_top_college")]
        elif category == "internships":
            header = "💼 <b>Upcoming Internship Listings</b>"
            items = [d for d in docs if d.get("is_internship")]
        elif category == "online":
            header = "🌐 <b>Online Hackathons</b>"
            items = [d for d in docs if "online" in (d.get("mode") or "").lower()]
        elif category == "offline":
            header = "📍 <b>In-Person Hackathons</b>"
            items = [d for d in docs if "offline" in (d.get("mode") or "").lower()]
        elif category == "prizes":
            header = "🏆 <b>Highest Prize Pool Hackathons</b>"
            items = [d for d in docs if d.get("prize")]
        elif category == "closing_soon":
            header = "⏳ <b>Closing Soon (&lt; 72 hours left)</b>"
            items = [d for d in docs if _is_closing_soon(d.get("deadline", ""))]
        elif category in ("devfolio", "unstop", "devpost", "devnovate", "hackerearth"):
            header = f"📡 <b>Latest from {category.capitalize()}</b>"
            items = [d for d in docs if d.get("source", "").lower() == category]

        if not items:
            bot.send_message(chat_id, f"😕 No results found for <b>{category}</b> right now.",
                             parse_mode="HTML", reply_markup=_make_main_keyboard())
            return

        text, markup = _render_page(items, header, page=1, category=category)
        if reply_to_id:
            bot.send_message(chat_id, text, parse_mode="HTML",
                             disable_web_page_preview=True,
                             reply_to_message_id=reply_to_id,
                             reply_markup=markup)
        else:
            bot.send_message(chat_id, text, parse_mode="HTML",
                             disable_web_page_preview=True,
                             reply_markup=markup)

    @bot.message_handler(commands=["latest"])
    @bot.message_handler(func=lambda m: m.text and m.text.strip() == "🔥 Latest")
    def handle_latest(m): _show_category(m.chat.id, "latest", m.message_id)

    @bot.message_handler(commands=["top"])
    @bot.message_handler(func=lambda m: m.text and m.text.strip() == "🏛 Top College")
    def handle_top(m): _show_category(m.chat.id, "top", m.message_id)

    @bot.message_handler(commands=["internships"])
    @bot.message_handler(func=lambda m: m.text and m.text.strip() == "💼 Internships")
    def handle_internships(m): _show_category(m.chat.id, "internships", m.message_id)

    @bot.message_handler(commands=["online"])
    @bot.message_handler(func=lambda m: m.text and m.text.strip() == "🌐 Online")
    def handle_online(m): _show_category(m.chat.id, "online", m.message_id)

    @bot.message_handler(commands=["offline"])
    @bot.message_handler(func=lambda m: m.text and m.text.strip() == "📍 Offline")
    def handle_offline(m): _show_category(m.chat.id, "offline", m.message_id)

    @bot.message_handler(commands=["prizes"])
    @bot.message_handler(func=lambda m: m.text and m.text.strip() == "🏆 Top Prizes")
    def handle_prizes(m): _show_category(m.chat.id, "prizes", m.message_id)

    @bot.message_handler(commands=["closing_soon"])
    @bot.message_handler(func=lambda m: m.text and m.text.strip() == "⏳ Closing Soon")
    def handle_closing_soon(m): _show_category(m.chat.id, "closing_soon", m.message_id)

    # Source commands
    @bot.message_handler(commands=["devfolio", "unstop", "devpost", "devnovate", "hackerearth"])
    def handle_sources(m):
        cmd = m.text.lstrip("/").split()[0].lower()
        _show_category(m.chat.id, cmd, m.message_id)

    # ── Search Handler ────────────────────────────────────────────────────────
    def _execute_search(chat_id, query: str, reply_to_id: int | None = None):
        bot.send_chat_action(chat_id, "typing")
        res = _get_data(search=query, limit=50)
        docs = [d for d in res.get("data", []) if not d.get("is_past")]

        if not docs:
            bot.send_message(
                chat_id,
                f"🔍 No upcoming hackathons matched <b>'{_escape_html(query)}'</b>.\n"
                "Try another keyword like <code>AI</code>, <code>Web3</code>, <code>Bangalore</code>, or <code>IIT</code>.",
                parse_mode="HTML",
                reply_markup=_make_main_keyboard()
            )
            return

        header = f"🔍 <b>Search Results for '{_escape_html(query)}'</b>"
        text, markup = _render_page(docs, header, page=1, category="search", query=query)
        bot.send_message(chat_id, text, parse_mode="HTML",
                         disable_web_page_preview=True,
                         reply_to_message_id=reply_to_id,
                         reply_markup=markup)

    @bot.message_handler(commands=["search"])
    def handle_search_command(message):
        parts = message.text.split(maxsplit=1)
        if len(parts) < 2 or not parts[1].strip():
            bot.reply_to(
                message,
                "🔍 Please specify a keyword to search.\n"
                "Example: <code>/search AI</code> or <code>/search Mumbai</code>",
                parse_mode="HTML"
            )
            return
        _execute_search(message.chat.id, parts[1].strip(), message.message_id)

    # ── Location & Proximity ──────────────────────────────────────────────────
    @bot.message_handler(commands=["nearest"])
    def handle_nearest(message):
        kb = types.ReplyKeyboardMarkup(resize_keyboard=True, one_time_keyboard=True, row_width=1)
        kb.add(types.KeyboardButton("📍 Share My Location", request_location=True))
        kb.add(types.KeyboardButton("❌ Cancel"))
        bot.reply_to(
            message,
            "📍 <b>Find In-Person Hackathons Near You</b>\n\n"
            "Tap below to share your GPS location. Distance will be calculated instantly.",
            parse_mode="HTML",
            reply_markup=kb
        )

    @bot.message_handler(content_types=["location"])
    def handle_location(message):
        lat = message.location.latitude
        lng = message.location.longitude

        bot.send_chat_action(message.chat.id, "find_location")
        bot.send_message(message.chat.id, "📡 Calculating distances…", reply_markup=types.ReplyKeyboardRemove())

        res = _get_data(lat=lat, lng=lng, sort="distance", limit=30)
        docs = res.get("data", [])

        nearby = [
            d for d in docs
            if not d.get("is_past")
            and "distance_km" in d
            and (d.get("mode") or "").lower() in ("offline", "hybrid")
        ]
        nearby.sort(key=lambda d: d.get("distance_km", 999_999))

        if not nearby:
            bot.send_message(message.chat.id, "😕 No offline events found in the database.", reply_markup=_make_main_keyboard())
            return

        header = f"🗺️ <b>Nearest Offline Hackathons</b> (from {lat:.3f}, {lng:.3f})"
        text, markup = _render_page(nearby, header, page=1, category="nearest", show_distance=True)
        bot.send_message(message.chat.id, text, parse_mode="HTML", disable_web_page_preview=True, reply_markup=markup)

    # ── Subscription & Settings Handlers ──────────────────────────────────────
    def _send_settings_menu(chat_id: str, message_id: int | None = None):
        try:
            from db.mongo_client import get_subscribers_collection
            col = get_subscribers_collection()
            sub = col.find_one({"chat_id": str(chat_id)}) if col is not None else None
            pref = sub.get("preference", "all") if sub else "inactive"
        except Exception:
            pref = "all"

        pref_map = {
            "all":         "🚀 All Hackathons",
            "top_college": "🏛 Top College Only",
            "internships": "💼 Internships Only",
            "inactive":    "❌ Unsubscribed",
        }
        current_label = pref_map.get(pref, "All")

        text = (
            "🔔 <b>Notification Alert Settings</b>\n\n"
            f"Current Status: <b>{current_label}</b>\n\n"
            "Choose which real-time alerts you want to receive directly in Telegram:"
        )

        kb = types.InlineKeyboardMarkup(row_width=1)
        kb.add(
            types.InlineKeyboardButton(f"{'✅ ' if pref=='all' else ''}🚀 All New Hackathons", callback_data="sub_pref:all"),
            types.InlineKeyboardButton(f"{'✅ ' if pref=='top_college' else ''}🏛 Top College Only (IIT/NIT/BITS)", callback_data="sub_pref:top_college"),
            types.InlineKeyboardButton(f"{'✅ ' if pref=='internships' else ''}💼 Internships Only", callback_data="sub_pref:internships"),
            types.InlineKeyboardButton("❌ Turn Off Alerts (Unsubscribe)", callback_data="sub_pref:unsubscribe"),
        )
        if message_id:
            try:
                bot.edit_message_text(text, chat_id=chat_id, message_id=message_id, parse_mode="HTML", reply_markup=kb)
                return
            except Exception:
                pass
        bot.send_message(chat_id, text, parse_mode="HTML", reply_markup=kb)

    @bot.message_handler(commands=["subscribe", "settings"])
    @bot.message_handler(func=lambda m: m.text and m.text.strip() == "🔔 Alerts")
    def handle_subscribe_settings(m):
        _send_settings_menu(str(m.chat.id))

    @bot.message_handler(commands=["unsubscribe"])
    def handle_unsubscribe(message):
        try:
            from db.mongo_client import remove_subscriber
            remove_subscriber(message.chat.id)
            bot.reply_to(message, "🔕 You have been unsubscribed from automated alerts.", reply_markup=_make_main_keyboard())
        except Exception as e:
            bot.reply_to(message, "Error updating subscription. Please try again later.")

    # ── Platform Stats ────────────────────────────────────────────────────────
    @bot.message_handler(commands=["stats"])
    @bot.message_handler(func=lambda m: m.text and m.text.strip() == "📊 Stats")
    def handle_stats(message):
        bot.send_chat_action(message.chat.id, "typing")
        res = _get_data()
        s = res.get("stats", {})
        upcoming = res.get("upcoming_total", 0)
        missed   = res.get("missed_total",   0)

        # Get active subscriber count
        sub_count = 0
        try:
            from db.mongo_client import get_subscriber_count
            sub_count = get_subscriber_count()
        except Exception:
            pass

        text = (
            "📊 <b>Live Platform Ingestion Metrics</b>\n\n"
            f"🎯 Total Opportunities: <b>{s.get('total', 0):,}</b>\n"
            f"🚀 Active & Upcoming: <b>{upcoming:,}</b>\n"
            f"📁 Past / Missed: <b>{missed:,}</b>\n\n"
            f"🏛 Top College (IIT/NIT/BITS): <b>{s.get('top_college_count', 0)}</b>\n"
            f"💼 Internships: <b>{s.get('internship_count', 0)}</b>\n"
            f"🌐 Online: <b>{s.get('online_count', 0)}</b>  ·  📍 Offline: <b>{s.get('offline_count', 0)}</b>\n"
            f"📡 Indexed Platforms: <b>{', '.join(s.get('sources', [])) or '5'}</b>\n"
            f"👥 Telegram Subscribers: <b>{sub_count} active</b>\n\n"
            f'<a href="{WEBAPP_URL}">🌍 Open Live Dashboard →</a>'
        )
        bot.reply_to(message, text, parse_mode="HTML", disable_web_page_preview=True, reply_markup=_make_main_keyboard())

    # ── Admin Tools ───────────────────────────────────────────────────────────
    def _is_admin(chat_id: str) -> bool:
        if not TELEGRAM_CHAT_ID:
            return False
        return str(chat_id).strip() == str(TELEGRAM_CHAT_ID).strip()

    @bot.message_handler(commands=["scrape_now"])
    def handle_admin_scrape(message):
        if not _is_admin(str(message.chat.id)):
            bot.reply_to(message, "⛔ Admin-only command.")
            return

        bot.reply_to(message, "🔄 <b>Starting scrape pipeline in background…</b>", parse_mode="HTML")

        def _worker():
            try:
                import main as main_module
                new_sent = main_module.run_pipeline()
                bot.send_message(
                    message.chat.id,
                    f"✅ <b>Scrape Pipeline Finished!</b>\nNew items notified: <b>{new_sent}</b>",
                    parse_mode="HTML"
                )
            except Exception as ex:
                bot.send_message(message.chat.id, f"❌ Scrape failed: {ex}")

        threading.Thread(target=_worker, daemon=True).start()

    @bot.message_handler(commands=["broadcast"])
    def handle_admin_broadcast(message):
        if not _is_admin(str(message.chat.id)):
            bot.reply_to(message, "⛔ Admin-only command.")
            return

        parts = message.text.split(maxsplit=1)
        if len(parts) < 2 or not parts[1].strip():
            bot.reply_to(message, "Usage: <code>/broadcast &lt;message&gt;</code>", parse_mode="HTML")
            return

        body = parts[1].strip()
        if len(body) > 3800:
            bot.reply_to(message, "⚠️ Broadcast message exceeds maximum allowed length (3800 characters).")
            return

        broadcast_text = f"📢 <b>Announcement:</b>\n\n{_escape_html(body)}"
        try:
            from db.mongo_client import get_active_subscribers
            subs = get_active_subscribers()
            recipients = {str(s["chat_id"]) for s in subs if s.get("chat_id")}
            if TELEGRAM_CHAT_ID:
                recipients.add(str(TELEGRAM_CHAT_ID))

            sent = 0
            for cid in recipients:
                try:
                    bot.send_message(cid, broadcast_text, parse_mode="HTML")
                    sent += 1
                    time.sleep(0.3)
                except Exception:
                    pass
            bot.reply_to(message, f"✅ Broadcast sent to {sent} subscriber(s).")
        except Exception as e:
            bot.reply_to(message, f"❌ Broadcast failed: {e}")

    @bot.message_handler(commands=["subscribers"])
    def handle_admin_subscribers(message):
        if not _is_admin(str(message.chat.id)):
            bot.reply_to(message, "⛔ Admin-only command.")
            return
        try:
            from db.mongo_client import get_subscribers_collection
            col = get_subscribers_collection()
            if col is None:
                bot.reply_to(message, "Database unavailable.")
                return
            active = col.count_documents({"is_active": True})
            all_pref = col.count_documents({"is_active": True, "preference": "all"})
            top_pref = col.count_documents({"is_active": True, "preference": "top_college"})
            int_pref = col.count_documents({"is_active": True, "preference": "internships"})
            bot.reply_to(
                message,
                f"👥 <b>Active Subscribers: {active}</b>\n"
                f"• All hackathons: {all_pref}\n"
                f"• Top College: {top_pref}\n"
                f"• Internships: {int_pref}",
                parse_mode="HTML"
            )
        except Exception as e:
            bot.reply_to(message, f"Error: {e}")

    # ── Callback Query Router (In-Place Interactive Navigation) ───────────────
    @bot.callback_query_handler(func=lambda call: True)
    def handle_callbacks(call):
        data = call.data or ""
        chat_id = call.message.chat.id
        msg_id = call.message.message_id

        try:
            bot.answer_callback_query(call.id)
        except Exception:
            pass

        if data == "noop":
            return

        if data == "open_settings":
            _send_settings_menu(str(chat_id), msg_id)
            return

        if data.startswith("sub_pref:"):
            pref = data.split(":", 1)[1]
            try:
                from db.mongo_client import update_subscriber_preference, remove_subscriber
                if pref == "unsubscribe":
                    remove_subscriber(chat_id)
                    bot.edit_message_text(
                        "🔕 <b>Alerts Disabled</b>\nYou will no longer receive automated notifications.",
                        chat_id=chat_id,
                        message_id=msg_id,
                        parse_mode="HTML"
                    )
                else:
                    update_subscriber_preference(chat_id, pref)
                    _send_settings_menu(str(chat_id), msg_id)
            except Exception as ex:
                logger.exception("Error updating preference: %s", ex)
            return

        if data.startswith("filter:"):
            cat = data.split(":", 1)[1]
            if cat == "stats":
                handle_stats(call.message)
                return
            # Switch category in-place
            res = _get_data(limit=100)
            docs = [d for d in res.get("data", []) if not d.get("is_past")]
            header = "🔥 <b>Latest Upcoming Opportunities</b>"
            items = docs

            if cat == "top":
                header = "🏛 <b>Top College Hackathons</b>"
                items = [d for d in docs if d.get("is_top_college")]
            elif cat == "internships":
                header = "💼 <b>Upcoming Internships</b>"
                items = [d for d in docs if d.get("is_internship")]
            elif cat == "online":
                header = "🌐 <b>Online Hackathons</b>"
                items = [d for d in docs if "online" in (d.get("mode") or "").lower()]
            elif cat == "offline":
                header = "📍 <b>In-Person Hackathons</b>"
                items = [d for d in docs if "offline" in (d.get("mode") or "").lower()]
            elif cat == "prizes":
                header = "🏆 <b>Highest Prize Pools</b>"
                items = [d for d in docs if d.get("prize")]
            elif cat == "closing_soon":
                header = "⏳ <b>Closing Soon (&lt; 72h)</b>"
                items = [d for d in docs if _is_closing_soon(d.get("deadline", ""))]

            text, markup = _render_page(items, header, page=1, category=cat)
            try:
                bot.edit_message_text(text, chat_id=chat_id, message_id=msg_id,
                                      parse_mode="HTML", disable_web_page_preview=True,
                                      reply_markup=markup)
            except Exception:
                pass
            return

        if data.startswith("page:"):
            # Format: page:<category>:<page_num>[:search_query]
            parts = data.split(":")
            category = parts[1]
            page_num = int(parts[2])
            query = parts[3] if len(parts) > 3 else ""

            res = _get_data(search=query if category == "search" else "", limit=100)
            docs = [d for d in res.get("data", []) if not d.get("is_past")]

            header = "🔥 <b>Latest Upcoming Opportunities</b>"
            items = docs

            if category == "top":
                header = "🏛 <b>Top College Hackathons</b>"
                items = [d for d in docs if d.get("is_top_college")]
            elif category == "internships":
                header = "💼 <b>Upcoming Internships</b>"
                items = [d for d in docs if d.get("is_internship")]
            elif category == "online":
                header = "🌐 <b>Online Hackathons</b>"
                items = [d for d in docs if "online" in (d.get("mode") or "").lower()]
            elif category == "offline":
                header = "📍 <b>In-Person Hackathons</b>"
                items = [d for d in docs if "offline" in (d.get("mode") or "").lower()]
            elif category == "prizes":
                header = "🏆 <b>Highest Prize Pools</b>"
                items = [d for d in docs if d.get("prize")]
            elif category == "closing_soon":
                header = "⏳ <b>Closing Soon (&lt; 72h)</b>"
                items = [d for d in docs if _is_closing_soon(d.get("deadline", ""))]
            elif category == "search":
                header = f"🔍 <b>Search Results for '{_escape_html(query)}'</b>"
            elif category in ("devfolio", "unstop", "devpost", "devnovate", "hackerearth"):
                header = f"📡 <b>Latest from {category.capitalize()}</b>"
                items = [d for d in docs if d.get("source", "").lower() == category]

            text, markup = _render_page(items, header, page=page_num, category=category, query=query)
            try:
                bot.edit_message_text(text, chat_id=chat_id, message_id=msg_id,
                                      parse_mode="HTML", disable_web_page_preview=True,
                                      reply_markup=markup)
            except Exception:
                pass
            return

    # ── Fallback & Natural Language Search ────────────────────────────────────
    @bot.message_handler(func=lambda m: m.text and not m.text.startswith("/"))
    def handle_freeform_text(message):
        text = message.text.strip()
        if text in ("❌ Cancel", "Cancel"):
            bot.reply_to(message, "Cancelled.", reply_markup=_make_main_keyboard())
            return

        # Treat any non-command text as a keyword search!
        _execute_search(message.chat.id, text, message.message_id)

    logger.info("Telegram bot polling initialized.")
    try:
        bot.infinity_polling(timeout=30, long_polling_timeout=25)
    except Exception:
        logger.exception("Polling stopped unexpectedly.")


# ── Self-test ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", stream=sys.stdout)

    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("ERROR: Telegram credentials missing — set in Backend/.env")
        sys.exit(1)

    test_hack = {
        "title":               "Test Hackathon — Max Level Verification",
        "deadline":            "31/12/2026",
        "mode":                "Online",
        "tags":                ["AI", "Web3", "Telegram", "FullStack"],
        "link":                "https://devfolio.co/hackathons",
        "source":              "Devfolio",
        "is_top_college":      True,
        "college_type":        "IIT",
        "college_name":        "IIT Bombay",
        "is_internship":       True,
        "opportunity_type":    "Hackathon",
        "location":            "Mumbai, India",
        "prize":               "$50,000 USD",
        "total_registrations": 4_200,
        "min_team_size":       2,
        "max_team_size":       4,
    }
    ok = send_notification(test_hack)
    print("Result:", "PASS — Push notification sent to Telegram!" if ok else "FAIL — check logs.")
    sys.exit(0 if ok else 1)
