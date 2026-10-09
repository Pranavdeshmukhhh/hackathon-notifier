"""Shared pytest fixtures and configuration."""
import sys
from pathlib import Path

# Ensure Backend/ is on sys.path so that `from scrapers.X import Y` works
# when pytest is invoked from the repo root.
_backend = Path(__file__).resolve().parent.parent
if str(_backend) not in sys.path:
    sys.path.insert(0, str(_backend))

import os
import pytest

# Never allow test imports to load live credentials from Backend/.env.
os.environ["MONGO_URI"] = "mongodb://127.0.0.1:27017/phase0_test"
os.environ["TELEGRAM_BOT_TOKEN"] = ""
os.environ["TELEGRAM_CHAT_ID"] = ""
os.environ["ENABLE_BACKGROUND_SCANNER"] = "false"
os.environ["ENABLE_NOTIFICATION_DELIVERY"] = "false"
os.environ["ENABLE_TELEGRAM_POLLING"] = "false"
os.environ["ENABLE_GEOCODING"] = "false"
os.environ["PHASE5_WRITE_TRANSACTIONS"] = "false"
os.environ["RENDER"] = "false"
os.environ["MONGO_DB_NAME"] = "phase0_test"
os.environ["TRACK_VISITORS"] = "false"
os.environ["ENVIRONMENT"] = "development"
os.environ["ADMIN_SECRET"] = ""
os.environ["TRUSTED_PROXY_CIDRS"] = ""
os.environ["TRUST_CLOUDFLARE_HEADERS"] = "false"

@pytest.fixture
def anyio_backend():
    return "asyncio"
