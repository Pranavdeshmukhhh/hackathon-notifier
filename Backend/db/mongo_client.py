"""
mongo_client.py — MongoDB connection module.

Provides a single, lazily-initialised MongoClient and exposes
get_collection() for the rest of the app to use.
"""

import os
import logging
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError, OperationFailure

# ── Load .env ────────────────────────────────────────────────────────────────
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

MONGO_URI       = os.getenv("MONGO_URI", "")
DB_NAME         = "hackathon_tracker"
COLLECTION_NAME = "hackathons"

logger = logging.getLogger(__name__)

# ── Internal singletons ───────────────────────────────────────────────────────
_client: MongoClient | None = None
_db = None


def _connect() -> None:
    """Establish connection and create unique index (idempotent)."""
    global _client, _db

    if _client is not None:          # Already connected — nothing to do
        return

    if not MONGO_URI:
        logger.error("MONGO_URI is not set — update Backend/.env")
        return

    try:
        _client = MongoClient(
            MONGO_URI,
            serverSelectionTimeoutMS=5_000,
            maxPoolSize=10,           # Explicit pool; safe for small workloads
            connectTimeoutMS=5_000,
            socketTimeoutMS=10_000,
        )
        _client.admin.command("ping")   # Verify connection immediately
        _db = _client[DB_NAME]

        # create_index is a no-op if the index already exists
        _db[COLLECTION_NAME].create_index("link", unique=True)
        logger.info("MongoDB connected — pool ready, unique index on 'link' confirmed.")

    except (ConnectionFailure, ServerSelectionTimeoutError):
        logger.exception("MongoDB connection failed (timeout / unreachable)")
        _client = _db = None
    except OperationFailure:
        logger.exception("MongoDB auth / permission failure")
        _client = _db = None
    except Exception:
        logger.exception("Unexpected error connecting to MongoDB")
        _client = _db = None


def get_collection():
    """
    Return the 'hackathons' PyMongo Collection, or None on failure.

    Usage:
        from db.mongo_client import get_collection
        col = get_collection()
        if col is not None:
            col.insert_one({...})
    """
    _connect()
    if _db is not None:
        return _db[COLLECTION_NAME]
    logger.error("get_collection() called but database is unavailable.")
    return None


# ── Self-test ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    col = get_collection()
    if col is not None:
        print(f"OK — collection: {col.full_name}")
        sys.exit(0)
    else:
        print("FAIL — check logs above.")
        sys.exit(1)
