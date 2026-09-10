"""
mongo_client.py — MongoDB connection module.

Provides a single, lazily-initialised MongoClient and exposes
get_collection() for the rest of the app to use.
"""

import os
import time
import logging
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError, OperationFailure

# ── Load .env ────────────────────────────────────────────────────────────────
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

MONGO_URI              = os.getenv("MONGO_URI", "")
DB_NAME                = "hackathon_tracker"
COLLECTION_NAME        = "hackathons"
SUBSCRIBERS_COLLECTION = "subscribers"

logger = logging.getLogger(__name__)

# ── Internal singletons ───────────────────────────────────────────────────────
_client: MongoClient | None = None
_db = None


def _connect() -> None:
    """Establish connection and create unique indexes (idempotent)."""
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
        _db[SUBSCRIBERS_COLLECTION].create_index("chat_id", unique=True)
        logger.info("MongoDB connected — pool ready, unique indexes confirmed.")

    except (ConnectionFailure, ServerSelectionTimeoutError):
        logger.exception("MongoDB connection failed (timeout / unreachable)")
        _client = _db = None
    except OperationFailure:
        logger.exception("MongoDB auth / permission failure")
        _client = _db = None
    except Exception:
        logger.exception("Unexpected error connecting to MongoDB")
        _client = _db = None


def get_collection(name: str = COLLECTION_NAME):
    """
    Return the specified PyMongo Collection (default: 'hackathons'), or None on failure.

    Usage:
        from db.mongo_client import get_collection
        col = get_collection()
        if col is not None:
            col.insert_one({...})
    """
    _connect()
    if _db is not None:
        return _db[name]
    logger.error("get_collection() called but database is unavailable.")
    return None


def get_subscribers_collection():
    """Return the 'subscribers' collection or None."""
    return get_collection(SUBSCRIBERS_COLLECTION)


def add_subscriber(chat_id: int | str, user_info: dict | None = None, preference: str = "all") -> bool:
    """Add or re-activate a subscriber."""
    col = get_subscribers_collection()
    if col is None:
        return False
    try:
        data = {
            "chat_id": str(chat_id),
            "preference": preference,  # "all", "top_college", "internships"
            "is_active": True,
            "updated_at": time.time(),
        }
        if user_info:
            if user_info.get("username"):
                data["username"] = user_info["username"]
            if user_info.get("first_name"):
                data["first_name"] = user_info["first_name"]
            if user_info.get("last_name"):
                data["last_name"] = user_info["last_name"]
        col.update_one(
            {"chat_id": str(chat_id)},
            {"$set": data, "$setOnInsert": {"subscribed_at": time.time()}},
            upsert=True
        )
        return True
    except Exception as e:
        logger.exception("Failed to add subscriber %s: %s", chat_id, e)
        return False


def remove_subscriber(chat_id: int | str) -> bool:
    """Mark a subscriber as inactive (opt-out)."""
    col = get_subscribers_collection()
    if col is None:
        return False
    try:
        col.update_one(
            {"chat_id": str(chat_id)},
            {"$set": {"is_active": False, "unsubscribed_at": time.time()}}
        )
        return True
    except Exception as e:
        logger.exception("Failed to remove subscriber %s: %s", chat_id, e)
        return False


def get_active_subscribers(preference: str | None = None) -> list[dict]:
    """Return all active subscribers, optionally filtered by preference."""
    col = get_subscribers_collection()
    if col is None:
        return []
    try:
        query = {"is_active": True}
        if preference and preference != "all":
            query["preference"] = {"$in": ["all", preference]}
        return list(col.find(query, {"_id": 0}))
    except Exception as e:
        logger.exception("Failed to fetch active subscribers: %s", e)
        return []


def update_subscriber_preference(chat_id: int | str, preference: str) -> bool:
    """Update notification preference for a subscriber."""
    col = get_subscribers_collection()
    if col is None:
        return False
    try:
        col.update_one(
            {"chat_id": str(chat_id)},
            {"$set": {"preference": preference, "is_active": True, "updated_at": time.time()}},
            upsert=True
        )
        return True
    except Exception as e:
        logger.exception("Failed to update preference for %s: %s", chat_id, e)
        return False


def get_subscriber_count() -> int:
    """Return active subscriber count."""
    col = get_subscribers_collection()
    if col is None:
        return 0
    try:
        return col.count_documents({"is_active": True})
    except Exception:
        return 0


# ── Self-test ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    col = get_collection()
    if col is not None:
        print(f"OK — collection: {col.full_name}")
        sub_col = get_subscribers_collection()
        print(f"OK — subscribers: {sub_col.full_name if sub_col is not None else 'None'}")
        sys.exit(0)
    else:
        print("FAIL — check logs above.")
        sys.exit(1)

