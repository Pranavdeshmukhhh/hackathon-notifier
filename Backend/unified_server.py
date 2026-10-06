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
    """Start Telegram bot polling (blocks forever, retries on crash)."""
    logger.info("🤖 Starting Telegram bot polling thread...")
    while True:
        try:
            start_polling()
        except Exception as e:
            logger.exception("Telegram polling crashed: %s. Retrying in 15 seconds...", e)
            time.sleep(15)


# ── Background: Scheduled Scraping (Every 15 Minutes) ────────────────────────
def _run_scheduler():
    """Run the scraping pipeline across all platforms, Instagram, and open-web every 15 minutes."""
    INTERVAL_MINUTES = max(5, int(os.getenv("SCAN_INTERVAL_MINUTES", "30") or 30))
    INTERVAL_SECONDS = INTERVAL_MINUTES * 60

    # Wait 20 seconds on startup to let the API server finish booting
    time.sleep(20)

    logger.info("⏰ Scheduler started — auto-scanning open internet, Instagram & platforms every %d minutes.", INTERVAL_MINUTES)
    while True:
        try:
            logger.info("⏰ 15-minute scheduled scrape & verification starting...")
            main_module.run_pipeline()
            try:
                from api import _cache
                _cache.clear()
                logger.info("⏰ Cache cleared in-memory after 15-minute scheduled scrape.")
            except Exception as e:
                logger.warning("Could not clear cache after scrape: %s", e)
            logger.info("⏰ 15-minute scheduled scrape complete.")
        except Exception:
            logger.exception(
                "⏰ Scheduled scrape failed (e.g. temporary network issue). "
                "Will retry in %d minutes.", INTERVAL_MINUTES
            )

        logger.info("⏰ Sleeping %d minutes until next auto-scan cycle...", INTERVAL_MINUTES)
        time.sleep(INTERVAL_SECONDS)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    port = int(os.getenv("PORT", "10000"))

    # Start Telegram bot in a daemon thread
    bot_thread = threading.Thread(target=_run_bot_polling, daemon=True)
    bot_thread.start()

    # Start scheduler in a daemon thread only if explicitly enabled
    enable_scanner = os.getenv("ENABLE_BACKGROUND_SCANNER", "true").lower() in ("true", "1", "yes")
    if enable_scanner:
        logger.info("⏰ ENABLE_BACKGROUND_SCANNER=true — starting background scheduler thread.")
        scheduler_thread = threading.Thread(target=_run_scheduler, daemon=True)
        scheduler_thread.start()
    else:
        logger.info("ℹ️ In-server background scanner disabled (ENABLE_BACKGROUND_SCANNER=false). Autonomous scanning is handled via GitHub Actions.")

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
