"""Tests for MongoDB dedup/insert logic using mongomock."""
import mongomock
import pytest

from pymongo.errors import DuplicateKeyError


@pytest.fixture()
def collection():
    """Provide a fresh mongomock collection with a unique index on 'link'."""
    client = mongomock.MongoClient()
    db = client["hackathon_tracker"]
    col = db["hackathons"]
    col.create_index("link", unique=True)
    return col


SAMPLE_HACK = {
    "title": "HackFest",
    "link": "https://example.com/hackfest",
    "deadline": "01 Jan 2027",
    "source": "Devfolio",
}


class TestInsertAndDedup:
    def test_insert_single_doc(self, collection):
        collection.insert_one(SAMPLE_HACK.copy())
        assert collection.count_documents({}) == 1

    def test_duplicate_link_raises(self, collection):
        collection.insert_one(SAMPLE_HACK.copy())
        with pytest.raises(DuplicateKeyError):
            collection.insert_one(SAMPLE_HACK.copy())

    def test_different_links_both_inserted(self, collection):
        doc1 = {**SAMPLE_HACK, "link": "https://example.com/a"}
        doc2 = {**SAMPLE_HACK, "link": "https://example.com/b"}
        collection.insert_one(doc1)
        collection.insert_one(doc2)
        assert collection.count_documents({}) == 2

    def test_upsert_does_not_duplicate(self, collection):
        """Simulates the idempotent insert pattern used in main.py."""
        for _ in range(3):
            collection.update_one(
                {"link": SAMPLE_HACK["link"]},
                {"$set": SAMPLE_HACK},
                upsert=True,
            )
        assert collection.count_documents({}) == 1

    def test_find_returns_inserted(self, collection):
        collection.insert_one(SAMPLE_HACK.copy())
        found = collection.find_one({"link": SAMPLE_HACK["link"]})
        assert found is not None
        assert found["title"] == "HackFest"
