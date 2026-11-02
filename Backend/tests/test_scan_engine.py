"""
test_scan_engine.py — Comprehensive tests for deduplication, change detection,
date parsing, archival, and notification tracking.
"""

from datetime import datetime, timezone, timedelta
import mongomock
import pytest

from scrapers.devpost_scraper import _parse_date as parse_devpost_date
from scrapers.hackerearth_scraper import _parse_date as parse_hackerearth_date
from notifier.telegram_bot import send_deadline_update, send_warning_alert


@pytest.fixture()
def mock_db():
    """Provide a fresh mongomock database with hackathons and scan_history collections."""
    client = mongomock.MongoClient()
    db = client["hackathon_tracker"]
    db["hackathons"].create_index("link", unique=True)
    return db


# ── Date Parsing Tests ────────────────────────────────────────────────────────

class TestDateParsing:
    def test_devpost_date_range(self):
        display, iso = parse_devpost_date("Jul 31 - Oct 15, 2026")
        assert iso == "2026-10-15"
        assert display == "15 Oct 2026"

    def test_devpost_single_end_date(self):
        display, iso = parse_devpost_date("Oct 01, 2026")
        assert iso == "2026-10-01"
        assert display == "01 Oct 2026"

    def test_devpost_empty_date(self):
        display, iso = parse_devpost_date("")
        assert display == "TBA"
        assert iso == ""

    def test_hackerearth_date_parsing(self):
        display, iso = parse_hackerearth_date("Sep 27, 2026")
        assert iso == "2026-09-27"
        assert display == "27 Sep 2026"

    def test_hackerearth_iso_format(self):
        display, iso = parse_hackerearth_date("2026-11-20")
        assert iso == "2026-11-20"
        assert display == "20 Nov 2026"

    def test_hackerearth_empty_date(self):
        display, iso = parse_hackerearth_date("")
        assert display == "TBA"
        assert iso == ""


# ── Deduplication and Change Detection Tests ──────────────────────────────────

class TestDeduplicationAndChangeDetection:
    def test_new_hackathon_insert_and_flags(self, mock_db):
        col = mock_db["hackathons"]
        now_utc = datetime.now(timezone.utc)
        today_iso = now_utc.strftime("%Y-%m-%d")
        future_iso = (now_utc + timedelta(days=10)).strftime("%Y-%m-%d")

        new_hack = {
            "title": "Future AI Hack",
            "link": "https://devfolio.co/hackathons/future-ai",
            "deadline": "10 days later",
            "deadline_iso": future_iso,
            "status": "Open",
            "mode": "Online",
            "prize": "₹1,00,000",
            "source": "Devfolio",
        }

        # Simulate insert logic from run_scan.py
        existing = col.find_one({"link": new_hack["link"]})
        assert existing is None

        new_hack["notified"] = False
        new_hack["archived"] = False
        new_hack["is_past"] = False
        col.insert_one(new_hack)

        saved = col.find_one({"link": new_hack["link"]})
        assert saved is not None
        assert saved["notified"] is False
        assert saved["archived"] is False
        assert saved["is_past"] is False
        assert col.count_documents({}) == 1

    def test_change_detection_updates_deadline_and_prize(self, mock_db):
        col = mock_db["hackathons"]
        link = "https://devfolio.co/hackathons/update-test"
        col.insert_one({
            "title": "Update Test Hack",
            "link": link,
            "deadline": "10 Oct 2026",
            "deadline_iso": "2026-10-10",
            "prize": "₹50,000",
            "mode": "Online",
            "notified": True,
            "archived": False,
        })

        # Incoming updated data
        incoming = {
            "title": "Update Test Hack",
            "link": link,
            "deadline": "25 Oct 2026",
            "deadline_iso": "2026-10-25",
            "prize": "₹1,00,000",
            "mode": "Online",
        }

        existing = col.find_one({"link": link})
        changed_fields = {}
        if incoming["deadline"] != existing["deadline"]:
            changed_fields["deadline"] = (existing["deadline"], incoming["deadline"])
        if incoming["deadline_iso"] != existing["deadline_iso"]:
            changed_fields["deadline_iso"] = (existing["deadline_iso"], incoming["deadline_iso"])
        if incoming["prize"] != existing["prize"]:
            changed_fields["prize"] = (existing["prize"], incoming["prize"])

        assert "deadline" in changed_fields
        assert "prize" in changed_fields
        assert changed_fields["deadline"] == ("10 Oct 2026", "25 Oct 2026")
        assert changed_fields["prize"] == ("₹50,000", "₹1,00,000")

        # Apply update
        update_set = {k: v[1] for k, v in changed_fields.items()}
        col.update_one({"_id": existing["_id"]}, {"$set": update_set})

        updated = col.find_one({"link": link})
        assert updated["deadline"] == "25 Oct 2026"
        assert updated["prize"] == "₹1,00,000"
        # Collection size should remain 1 (no duplicate created)
        assert col.count_documents({}) == 1

    def test_no_changes_detected_on_identical_payload(self, mock_db):
        col = mock_db["hackathons"]
        link = "https://devfolio.co/hackathons/identical-test"
        doc = {
            "title": "Identical Hack",
            "link": link,
            "deadline": "15 Nov 2026",
            "deadline_iso": "2026-11-15",
            "prize": "₹50,000",
            "mode": "Online",
        }
        col.insert_one(doc.copy())

        existing = col.find_one({"link": link})
        changed_fields = {}
        if doc["deadline"] != existing.get("deadline"):
            changed_fields["deadline"] = (existing.get("deadline"), doc["deadline"])
        if doc["prize"] != existing.get("prize"):
            changed_fields["prize"] = (existing.get("prize"), doc["prize"])

        assert len(changed_fields) == 0


# ── Archival Logic Tests ──────────────────────────────────────────────────────

class TestArchivalLogic:
    def test_expired_hackathons_marked_archived(self, mock_db):
        col = mock_db["hackathons"]
        today_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        past_iso = "2025-01-01"
        future_iso = "2027-12-31"

        col.insert_one({
            "title": "Past Hack",
            "link": "https://example.com/past",
            "deadline_iso": past_iso,
            "status": "Open",
            "archived": False,
            "is_past": False,
        })
        col.insert_one({
            "title": "Future Hack",
            "link": "https://example.com/future",
            "deadline_iso": future_iso,
            "status": "Open",
            "archived": False,
            "is_past": False,
        })

        # Run archival sweep
        archive_res = col.update_many(
            {
                "deadline_iso": {"$lt": today_iso, "$ne": "", "$exists": True},
                "archived": {"$ne": True},
            },
            {"$set": {"archived": True, "status": "Ended", "is_past": True}}
        )

        assert archive_res.modified_count == 1

        past_doc = col.find_one({"link": "https://example.com/past"})
        assert past_doc["archived"] is True
        assert past_doc["status"] == "Ended"
        assert past_doc["is_past"] is True

        future_doc = col.find_one({"link": "https://example.com/future"})
        assert future_doc["archived"] is False
        assert future_doc["status"] == "Open"
        assert future_doc["is_past"] is False


# ── Notification Deduplication Tests ──────────────────────────────────────────

class TestNotificationDeduplication:
    def test_notified_flag_prevents_duplicate_alerts(self, mock_db):
        col = mock_db["hackathons"]
        link = "https://example.com/single-alert"
        col.insert_one({
            "title": "Premier IIT Hack",
            "link": link,
            "is_top_college": True,
            "notified": False,
        })

        # 1. Fetch unnotified worthy hackathons
        unnotified = list(col.find({"notified": False, "is_top_college": True}))
        assert len(unnotified) == 1

        # 2. Simulate dispatch & update
        col.update_one({"link": link}, {"$set": {"notified": True, "notified_at": "2026-09-29T00:00:00Z"}})

        # 3. Next scan query: should return 0 unnotified items
        subsequent = list(col.find({"notified": False, "is_top_college": True}))
        assert len(subsequent) == 0
