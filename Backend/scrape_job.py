"""
scrape_job.py — Thin entry-point for scheduled scrape runs.

This is what you point your scheduler at (Render cron job, GitHub Actions
`schedule`, or a system cron). It sets up logging, runs the pipeline once,
and exits with a Unix exit code (0 = success, 1 = failure).

Why a separate file instead of calling `python main.py` directly?
  - main.py is also imported as a module by the Telegram bot (start_polling
    calls `import main`). Keeping the scheduler entry-point separate avoids
    any accidental side effects from module-level code in main.py.
  - This file can be called from a Render cron job command field:
      Command: python Backend/scrape_job.py
  - Or from a GitHub Actions step:
      run: cd Backend && python scrape_job.py

Render Cron Job setup:
  1. In your Render dashboard, create a new "Cron Job" service.
  2. Set the command to: python Backend/scrape_job.py
  3. Set the schedule to: 0 */4 * * *  (every 4 hours)
  4. Set environment variables (MONGO_URI, TELEGRAM_BOT_TOKEN, etc.) in
     the Render dashboard — same values as your web service.

GitHub Actions alternative (add to .github/workflows/scrape.yml):
  on:
    schedule:
      - cron: '0 */4 * * *'   # every 4 hours
  jobs:
    scrape:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-python@v5
          with: {python-version: '3.12'}
        - run: pip install -r Backend/requirements.txt
        - run: cd Backend && python scrape_job.py
          env:
            MONGO_URI: ${{ secrets.MONGO_URI }}
            TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
            TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}

NOTE: The Telegram polling bot (start_polling) is NOT started here.
It should run as a separate always-on Render web service via unified_server.py.
"""

import logging
import sys
from pathlib import Path

# Make sure Backend/ is importable whether we run from root or from Backend/
_here = Path(__file__).resolve().parent
if str(_here) not in sys.path:
    sys.path.insert(0, str(_here))

# ── UTF-8 on Windows so emoji in logs don't crash ────────────────────────────
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

# ── Import after path is set ──────────────────────────────────────────────────
try:
    from main import run_pipeline
except ImportError as e:
    logger.critical("Failed to import run_pipeline: %s", e)
    sys.exit(1)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="One-shot hackathon scrape job")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Scrape only — no DB writes, no Telegram sends.",
    )
    args = parser.parse_args()

    logger.info("scrape_job.py starting (dry_run=%s)", args.dry_run)
    try:
        run_pipeline(dry_run=args.dry_run)
        sys.exit(0)
    except Exception:
        logger.exception("scrape_job.py: unhandled exception in run_pipeline")
        sys.exit(1)
