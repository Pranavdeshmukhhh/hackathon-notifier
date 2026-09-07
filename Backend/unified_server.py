"""
unified_server.py — Single-process entry point for cloud deployment (Render).

Runs THREE things concurrently in ONE process:
  1. FastAPI API server  (HTTP, on $PORT or 10000)
  2. Telegram bot polling (background daemon thread)
  3. 4-hour scraping loop (background daemon thread)

Usage (local):   python unified_server.py
Usage (Render):  Procfile → web: python unified_server.py
"""

import logging
import os
import sys
import threading
import time

# ── Logging — configured ONCE, before any other imports ──────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

logger = logging.getLogger(__name__)

# ── Imports (after logging is configured) ────────────────────────────────────
import uvicorn
from api import app  # The FastAPI app
from notifier.telegram_bot import start_polling

# Import run_pipeline directly to avoid circular import issues
import main as main_module


# ── Background: Telegram Bot Polling ─────────────────────────────────────────

def _run_bot_polling():
    """Start Telegram bot polling (blocks forever)."""
    logger.info("🤖 Starting Telegram bot polling thread...")
    try:
        start_polling()
    except Exception:
        logger.exception("Telegram polling crashed — bot commands will not work.")


# ── Background: Scheduled Scraping ───────────────────────────────────────────

def _run_scheduler():
    """Run the scraping pipeline every 4 hours."""
    INTERVAL_HOURS = 4
    INTERVAL_SECONDS = INTERVAL_HOURS * 3600

    # Wait 30 seconds on startup to let the API server finish booting
    time.sleep(30)

    logger.info("⏰ Scheduler started — scraping every %d hours.", INTERVAL_HOURS)
    while True:
        try:
            logger.info("⏰ Scheduled scrape starting...")
            main_module.run_pipeline()
            logger.info("⏰ Scheduled scrape complete.")
        except Exception:
            logger.exception(
                "⏰ Scheduled scrape failed (e.g. no internet). "
                "Will retry next cycle."
            )

        logger.info("⏰ Sleeping %d hours until next scrape...", INTERVAL_HOURS)
        time.sleep(INTERVAL_SECONDS)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    port = int(os.getenv("PORT", "10000"))

    # Start Telegram bot in a daemon thread
    bot_thread = threading.Thread(target=_run_bot_polling, daemon=True)
    bot_thread.start()

    # Start scheduler in a daemon thread
    scheduler_thread = threading.Thread(target=_run_scheduler, daemon=True)
    scheduler_thread.start()

    # Start the FastAPI server (this blocks — keeps the process alive)
    logger.info("🚀 Starting FastAPI on port %d...", port)
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info",
        # Disable reload in production; enable locally if needed
        reload=False,
    )


if __name__ == "__main__":
    main()
