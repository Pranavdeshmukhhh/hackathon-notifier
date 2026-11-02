"""
Backend/db package — MongoDB persistence, connection pooling, and subscriber management.
"""

from .mongo_client import (
    get_collection,
    get_subscribers_collection,
    add_subscriber,
    MONGO_URI,
    DB_NAME,
    COLLECTION_NAME,
    SUBSCRIBERS_COLLECTION,
)

__all__ = [
    "get_collection",
    "get_subscribers_collection",
    "add_subscriber",
    "MONGO_URI",
    "DB_NAME",
    "COLLECTION_NAME",
    "SUBSCRIBERS_COLLECTION",
]
