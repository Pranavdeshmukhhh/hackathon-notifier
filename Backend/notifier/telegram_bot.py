"""
telegram_bot.py — Send hackathon notifications to a Telegram chat.

Two public functions:
  send_notification(hackathon) — send one message, returns bool
  send_batch(hackathon_list)   — send many messages with rate-limit delay

A single requests.Session is reused across the whole batch for
connection keep-alive (faster than a new TLS handshake per message).
"""

import logging
import os
import time
from pathlib import Path
from typing import Optional

import requests
import telebot
import threading
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

def _escape_html(text) -> str:
    """Escape &, < and > so Telegram's HTML parse mode doesn't break."""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _format_message(hackathon: dict) -> str:
    title    = hackathon.get("title",    "Unknown Hackathon")
    deadline = hackathon.get("deadline", "Not specified")
    mode     = hackathon.get("mode",     "Unknown")
    tags     = hackathon.get("tags",     [])
    link     = hackathon.get("link",     "")
    source   = hackathon.get("source",   "Unknown")

    # Classification metadata
    is_top_college   = hackathon.get("is_top_college", False)
    college_type     = hackathon.get("college_type")
    college_name     = hackathon.get("college_name")
    is_internship    = hackathon.get("is_internship", False)
    opportunity_type = hackathon.get("opportunity_type", "Hackathon")
    location         = hackathon.get("location", "")

    tags_str = ", ".join(tags) if tags else "No tags"

    # ── Build header with classification badges ──
    header_parts = []
    if is_top_college and college_name:
        header_parts.append(f"\U0001f3db <b>{_escape_html(college_name)}</b>")
    if is_internship:
        header_parts.append("\U0001f4bc <b>Internship</b>")

    if header_parts:
        badge_line = " • ".join(header_parts)
        msg = (
            f"\U0001f680 <b>New {_escape_html(opportunity_type)} Alert!</b>\n"
            f"{badge_line}\n\n"
        )
    else:
        msg = f"\U0001f680 <b>New {_escape_html(opportunity_type)} Alert!</b>\n\n"

    msg += (
        f"\U0001f4cc <b>{_escape_html(title)}</b>\n"
        f"\U0001f4c5 Deadline: {_escape_html(deadline)}\n"
        f"\U0001f310 Mode: {_escape_html(mode)}\n"
    )

    if location:
        msg += f"\U0001f4cd Location: {_escape_html(location)}\n"

    msg += (
        f"\U0001f3f7\ufe0f Tags: {_escape_html(tags_str)}\n"
        f"\U0001f4e1 Platform: {_escape_html(source)}\n"
    )

    if is_top_college and college_type:
        msg += f"\U0001f393 College: {_escape_html(college_type)}\n"

    msg += "\n"

    if link:
        msg += f'\U0001f517 <a href="{link}">Register / View Details</a>'
    else:
        msg += "\U0001f517 Link not available"
    return msg


# ── Core send ─────────────────────────────────────────────────────────────────

class _TelegramRetryable(Exception):
    """Raised inside _do_send() to signal that tenacity should retry."""
    pass


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception_type(_TelegramRetryable),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=False,
)
def _do_send(requester, payload: dict, title: str) -> bool:
    """Inner HTTP send with tenacity retry on transient failures.

    Separated from send_notification() so that:
    - Credential checks and formatting happen once (no point retrying those).
    - The @retry decorator only applies to actual network/HTTP transients.
    - send_notification() always returns a bool and never raises.

    Retry strategy:
      - 3 attempts total (2 retries after first failure)
      - Exponential backoff: 2s → 4s → 8s (capped at 30s)
      - Only retries on _TelegramRetryable (transient errors)
      - HTTP 429: respects Telegram's retry_after field before re-raising
    """
    resp = requester.post(_API_URL, json=payload, timeout=REQUEST_TIMEOUT)

    if resp.status_code == 200 and resp.json().get("ok"):
        logger.info("Telegram OK: %s", title)
        return True

    if resp.status_code == 429:
        # Telegram rate-limit: honour their retry_after if provided
        retry_after = resp.json().get("parameters", {}).get("retry_after", 5)
        logger.warning(
            "Telegram 429 rate-limited for '%s'. Waiting %ds before retry.",
            title, retry_after,
        )
        time.sleep(retry_after)
        raise _TelegramRetryable(f"429 rate-limited (retry_after={retry_after}s)")

    if resp.status_code in (500, 502, 503, 504):
        # Server-side transient — retry
        raise _TelegramRetryable(f"Telegram server error HTTP {resp.status_code}")

    # 4xx (other than 429) = client error, don't retry
    logger.error("Telegram error (HTTP %d): %s", resp.status_code, resp.text[:200])
    return False


def send_notification(hackathon: dict, *, session: Optional[requests.Session] = None) -> bool:
    """
    Send a single hackathon notification to the configured Telegram chat.

    Rate-limiting strategy:
      - _do_send() retries on transient HTTP errors (429, 5xx) up to 3 times
        with exponential backoff (2s → 4s → 8s).
      - On 429, the Telegram-supplied retry_after duration is respected first.
      - send_batch() also spaces messages 1.5s apart to stay inside Telegram's
        30 msg/sec soft limit. The two mechanisms complement each other:
        backoff = per-message recovery, delay = overall throughput control.

    Args:
        hackathon: Normalised hackathon dict.
        session:   Optional requests.Session for connection reuse.

    Returns:
        True on success, False on any failure (never raises).
    """
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        logger.error("Telegram credentials missing — cannot send notification.")
        return False

    if not hackathon:
        logger.warning("send_notification: empty hackathon dict — skipping.")
        return False

    payload = {
        "chat_id":                  TELEGRAM_CHAT_ID,
        "text":                     _format_message(hackathon),
        "parse_mode":               "HTML",
        "disable_web_page_preview": False,
    }
    requester = session or requests
    title = hackathon.get("title", "?")

    try:
        return _do_send(requester, payload, title) or False
    except RetryError:
        logger.error("Telegram: all retry attempts exhausted for '%s'.", title)
    except requests.exceptions.Timeout:
        logger.error("Telegram timeout for: %s", title)
    except requests.exceptions.ConnectionError:
        logger.error("Telegram connection error for: %s", title)
    except requests.exceptions.RequestException:
        logger.exception("Telegram request failed for: %s", title)
    except Exception:
        logger.exception("Unexpected error sending Telegram notification.")
    return False


def send_batch(hackathon_list: list[dict]) -> dict:
    """
    Send notifications for multiple hackathons.

    Uses a single Session for connection keep-alive (saves one TLS
    handshake per message).  Adds MESSAGE_DELAY_S between messages
    to respect Telegram rate limits.

    Returns:
        {"total": int, "sent": int, "failed": int}
    """
    total = len(hackathon_list) if hackathon_list else 0
    if not hackathon_list:
        logger.info("send_batch: nothing to send.")
        return {"total": 0, "sent": 0, "failed": 0}

    logger.info("send_batch: sending %d notifications…", total)
    sent = failed = 0

    with requests.Session() as session:
        for i, hackathon in enumerate(hackathon_list, start=1):
            logger.info(
                "  [%d/%d] %s", i, total, hackathon.get("title", "?")
            )
            if send_notification(hackathon, session=session):
                sent += 1
            else:
                failed += 1

            if i < total:
                time.sleep(MESSAGE_DELAY_S)

    logger.info("send_batch complete: %d/%d sent, %d failed.", sent, total, failed)
    return {"total": total, "sent": sent, "failed": failed}


# ── Bot Listener (Polling) ────────────────────────────────────────────────────

def start_polling():
    """
    Start listening for Telegram commands (/start, /refresh) in a blocking loop.
    Typically meant to be run in a background thread.
    """
    if not TELEGRAM_BOT_TOKEN:
        logger.error("No TELEGRAM_BOT_TOKEN, cannot start polling.")
        return

    bot = telebot.TeleBot(TELEGRAM_BOT_TOKEN)

    def trigger_pipeline(chat_id: int):
        import main
        try:
            sent_count = main.run_pipeline()
            if sent_count > 0:
                bot.send_message(
                    chat_id, 
                    f"✅ Done! Found and sent {sent_count} new notification-worthy hackathons."
                )
            else:
                bot.send_message(
                    chat_id, 
                    "✅ Done! All up-to-date, no new hackathons were found."
                )
        except Exception as e:
            logger.exception("Error running pipeline from listener.")
            bot.send_message(chat_id, f"❌ An error occurred during refresh: {e}")

    @bot.message_handler(commands=['start', 'refresh'])
    def handle_start(message):
        logger.info("Received /%s command from %s", message.text.lstrip('/'), message.from_user.username)
        bot.reply_to(
            message, 
            "🔄 Refreshing hackathons...\n\nScraping Devfolio and Unstop. This might take a moment!"
        )
        threading.Thread(target=trigger_pipeline, args=(message.chat.id,)).start()

    logger.info("Starting Telegram bot polling...")
    try:
        bot.infinity_polling()
    except Exception as e:
        logger.exception("Polling stopped due to error: %s", e)


# ── Self-test ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
    )

    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("ERROR: Telegram credentials missing — set them in Backend/.env")
        sys.exit(1)

    test_hack = {
        "title":           "Test Hackathon — Please Ignore",
        "deadline":        "Starts 01/01/27",
        "mode":            "Online",
        "tags":            ["Test"],
        "link":            "https://devfolio.co/hackathons",
        "source":          "Test Script",
        "is_top_college":  True,
        "college_type":    "IIT",
        "college_name":    "IIT Bombay",
        "is_internship":   False,
        "opportunity_type": "Hackathon",
        "location":        "Mumbai, India",
    }
    ok = send_notification(test_hack)
    print("Result:", "PASS — check Telegram!" if ok else "FAIL — check logs.")
    sys.exit(0 if ok else 1)
