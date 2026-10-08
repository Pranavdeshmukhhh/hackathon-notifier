"""
unified_server.py — Single-process entry point for cloud deployment (Render).

Runs THREE things concurrently in ONE process:
  1. FastAPI API server  (HTTP, on $PORT or 10000)
  2. Telegram bot polling (only with a configured token)
  3. Explicitly enabled scraping loop (configured interval)

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
    if not os.getenv("TELEGRAM_BOT_TOKEN", "").strip():
        logger.info("Telegram polling disabled: no bot token configured.")
        return
    logger.info("Starting Telegram bot polling thread...")
    while True:
        try:
            start_polling()
            time.sleep(15)
        except Exception as e:
            logger.exception("Telegram polling crashed: %s. Retrying in 15 seconds...", e)
            time.sleep(15)


# ── Background: Scheduled Scraping (Configured Interval) ────────────────────────
def _run_scheduler():
    """Run the scraping pipeline across configured platforms at the selected interval."""
    INTERVAL_MINUTES = max(5, int(os.getenv("SCAN_INTERVAL_MINUTES", "30") or 30))
    INTERVAL_SECONDS = INTERVAL_MINUTES * 60

    # Wait 20 seconds on startup to let the API server finish booting
    time.sleep(20)

    logger.info("⏰ Scheduler started — auto-scanning open internet, Instagram & platforms every %d minutes.", INTERVAL_MINUTES)
    while True:
        try:
            logger.info("Scheduled scrape & verification starting...")
            main_module.run_pipeline()
            try:
                from api import _cache
                _cache.clear()
                logger.info("Cache cleared after scheduled scrape.")
            except Exception as e:
                logger.warning("Could not clear cache after scrape: %s", e)
            logger.info("Scheduled scrape complete.")
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
    enable_scanner = os.getenv("ENABLE_BACKGROUND_SCANNER", "false").lower() in ("true", "1", "yes")
    if enable_scanner:
        logger.info("⏰ ENABLE_BACKGROUND_SCANNER=true — starting background scheduler thread.")
        scheduler_thread = threading.Thread(target=_run_scheduler, daemon=True)
        scheduler_thread.start()
    else:
        logger.info("In-server scheduler disabled. Configure exactly one scheduler before enabling scans.")

    # Start the FastAPI server (this blocks — keeps the process alive)
    logger.info("🚀 Starting FastAPI on port %d...", port)
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info",
        # Disable reload in production; enable locally if needed
        reload=False,
        proxy_headers=False,
    )


if __name__ == "__main__":
    main()
