"""
test_internet_scanner.py — Unit tests for the autonomous multi-engine internet scanner.
"""

import pytest
from unittest.mock import MagicMock, patch
from scrapers.internet_scanner import (
    scan_single_keyword,
    run_internet_scan,
    get_scanner_status,
)


def test_scanner_initial_status():
    status = get_scanner_status()
    assert "is_scanning" in status
    assert "active_keywords" in status
    assert "colleges" in status["active_keywords"]
    assert "iit" in status["active_keywords"]["colleges"]
    assert "pune" in status["active_keywords"]["cities"]
    assert "faang" in status["active_keywords"]["faang"]


def test_scan_single_keyword_with_mock():
    mock_unstop = [
        {
            "title": "HackPune Techathon 2026 (COEP Pune)",
            "link": "https://unstop.com/hackathons/hackpune-techathon-coep-1751374",
            "source": "Unstop",
            "mode": "Offline",
            "location": "Pune, Maharashtra, India",
            "deadline": "2026-10-15",
            "prize": "₹2,50,000",
            "tags": ["pune", "coep"],
            "desc": "Annual Pune hackathon on Unstop",
        }
    ]

    with patch("scrapers.internet_scanner._scrape_unstop_feed", return_value=mock_unstop), \
         patch("scrapers.internet_scanner._scrape_devpost_feed", return_value=[]), \
         patch("scrapers.internet_scanner._scrape_hackerearth_feed", return_value=[]):
        res = scan_single_keyword("pune")
        assert len(res) == 1
        assert res[0]["title"] == "HackPune Techathon 2026 (COEP Pune)"
        assert res[0]["location"] == "Pune, Maharashtra, India"
        assert "unstop.com" in res[0]["link"]


def test_scan_single_keyword_filters_github_repos():
    mock_mixed = [
        {
            "title": "Real Hackathon",
            "link": "https://unstop.com/hackathons/real-hack",
            "source": "Unstop",
        },
        {
            "title": "Fake Student Project Repo",
            "link": "https://github.com/student/my-hackathon-project",
            "source": "Unstop",
        },
    ]

    with patch("scrapers.internet_scanner._scrape_unstop_feed", return_value=mock_mixed), \
         patch("scrapers.internet_scanner._scrape_devpost_feed", return_value=[]), \
         patch("scrapers.internet_scanner._scrape_hackerearth_feed", return_value=[]):
        res = scan_single_keyword("pune")
        assert len(res) == 1
        assert res[0]["title"] == "Real Hackathon"


def test_run_internet_scan_upsert():
    mock_items = [
        {
            "title": "IIIT Hyderabad Felicity Hackathon",
            "link": "https://unstop.com/hackathons/iiit-hyderabad-felicity-1761263",
            "source": "Unstop",
            "mode": "Virtual",
            "location": "Online",
            "deadline": "2026-11-20",
            "prize": "₹1,00,000",
            "tags": ["iiit", "hyderabad"],
            "desc": "Flagship tech fest",
        }
    ]

    import mongomock
    database = mongomock.MongoClient().phase5_restore_test
    with patch('scrapers.source_runner.bounded_scrape', return_value=mock_items), \
         patch('run_scan.get_collection', side_effect=lambda name='hackathons': database[name]), \
         patch('run_scan.batch_verify', side_effect=lambda docs, **kwargs: docs):
        res = run_internet_scan(keywords=['iiit'])
        assert res['success'] is True
        assert res['total_found'] == 1
        assert res['new_indexed'] == 1
        assert database.hackathons.count_documents({}) == 1
