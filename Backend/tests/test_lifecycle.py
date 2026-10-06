"""Tests for lifecycle.py — expiry parsing, archival, purge and safety guard."""

from datetime import datetime, timedelta, timezone

import mongomock
import pytest

import lifecycle as lc


@pytest.mark.parametrize(
    "text,expected",
    [
        ("2026-10-31", "2026-10-31"),
        ("Oct 31, 2026", "2026-10-31"),
        ("31st Oct 2026", "2026-10-31"),
        ("October 5 2026", "2026-10-05"),
        ("Oct 01 - 31, 2026", "2026-10-31"),
        ("Dec 29, 2026 - Jan 05, 2027", "2027-01-05"),
        ("15/11/2026", "2026-11-15"),
        ("TBA", None),
        ("", None),
        (None, None),
        ("rolling basis", None),
    ],
)
def test_parse_deadline_iso(text, expected):
    assert lc.parse_deadline_iso(text) == expected


def test_normalize_fills_iso_from_human_deadline():
    doc = {"deadline": "Jan 02, 2020"}
    assert lc.normalize_deadline(doc)["deadline_iso"] == "2020-01-02"


def test_drop_expired():
    docs = [{"deadline": "Jan 02, 2020"}, {"deadline": "Jan 02, 2099"}, {"deadline": "TBA"}]
    kept, dropped = lc.drop_expired(docs)
    assert dropped == 1 and len(kept) == 2


def _col():
    return mongomock.MongoClient().db.hackathons


def test_archive_then_purge_after_retention():
    col = _col()
    today = datetime.now(timezone.utc).date()
    col.insert_many(
        [
            {"link": "a", "deadline_iso": (today - timedelta(days=1)).isoformat()},
            {"link": "b", "deadline_iso": (today - timedelta(days=30)).isoformat()},
            {"link": "c", "deadline_iso": (today + timedelta(days=5)).isoformat()},
        ]
    )
    assert lc.archive_expired(col) == 2
    res = lc.purge_expired(col, retention=3)
    assert res["expired_removed"] == 1
    assert sorted(d["link"] for d in col.find()) == ["a", "c"]
    assert col.find_one({"link": "a"})["archived"] is True


def test_safety_guard_blocks_mass_delete():
    col = _col()
    old = "2020-01-01"
    col.insert_many([{"link": f"x{i}", "deadline_iso": old} for i in range(60)])
    res = lc.purge_expired(col, retention=0)
    assert res["expired_removed"] == 0 and res["skipped_by_guard"] == 60
    assert col.count_documents({}) == 60


def test_backfill_enables_archival():
    col = _col()
    col.insert_one({"link": "z", "deadline": "Jan 02, 2020", "deadline_iso": None})
    assert lc.backfill_deadlines(col) == 1
    assert lc.archive_expired(col) == 1


def test_unprobeable_hosts_never_dead():
    assert lc.check_link("https://www.instagram.com/p/xyz/") is lc.LinkStatus.UNKNOWN
    assert lc.check_link("not a url") is lc.LinkStatus.UNKNOWN
