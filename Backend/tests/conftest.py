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
os.environ['PYTHON_DOTENV_DISABLED'] = '1'
os.environ["MONGO_URI"] = "mongodb://127.0.0.1:27017/phase0_test"
os.environ["TELEGRAM_BOT_TOKEN"] = ""
os.environ["TELEGRAM_CHAT_ID"] = ""
os.environ["ENABLE_BACKGROUND_SCANNER"] = "false"
os.environ["TRACK_VISITORS"] = "false"
os.environ["ENVIRONMENT"] = "development"
os.environ["ADMIN_SECRET"] = ""
os.environ["TRUSTED_PROXY_CIDRS"] = ""
os.environ["TRUST_CLOUDFLARE_HEADERS"] = "false"

@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def notification_db(monkeypatch):
    """Explicit opt-in fixture: no notifier test may reach a configured database."""
    import mongomock
    from db import mongo_client
    db = mongomock.MongoClient(tz_aware=True).notification_test
    monkeypatch.setattr(mongo_client, 'get_collection', lambda name='hackathons': db[name])
    monkeypatch.setattr(mongo_client, 'get_subscribers_collection', lambda: db.subscribers)
    return db
