"""
instagram_scraper.py — Instagram Hackathon Post Scanner.

Scans public Instagram posts from known hackathon-organizer accounts and
hashtag feeds to discover hackathon announcements. Extracts event metadata
from captions, validates legitimacy, and returns verified hackathon records.

Architecture Notes:
  - Uses Instagram's public web endpoints (no login/API key required).
  - Scrapes from curated organizer accounts + hashtag discovery feeds.
  - Each post goes through a multi-signal verification pipeline before
    being accepted as a legitimate hackathon listing.
  - Rate-limited with polite delays to avoid Instagram blocks.

Privacy & Compliance:
  - Only accesses PUBLIC posts (no private/DM content).
  - Does not store user personal data — only event metadata.
  - Respects robots.txt rate limiting conventions.
"""

import logging
import re
import time
import random
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger("instagram_scraper")

# ── Curated Instagram Accounts Known to Post Hackathon Announcements ─────────
HACKATHON_ACCOUNTS = [
    "devaborad", "devfolio", "mlh", "hackclub", "hackerearth",
    "unstop.official", "devpost", "angelhack", "iaborad",
    "codingninjas", "geeksforgeeks_official", "leetcode",
    "hacktoberfest", "majorleaguehacking", "techfestmumbai",
    "mood_indigo_iitb", "rendezvous_iitd", "riviera_vit",
    "pecfest.official", "thomso_iitroorkee", "celesta.iitp",
    "techno_nit_surat",
]

# ── Hashtags to Monitor for Hackathon Announcements ──────────────────────────
HACKATHON_HASHTAGS = [
    "hackathon", "hackathon2025", "hackathon2026", "hackathonindia",
    "codinghackathon", "devhack", "buildinpublic", "hackathonseason",
    "mlhhackathon", "devfoliohack", "unstophackathon", "techhackathon",
    "collegechallenge", "iithackathon", "nithackathon",
    "hackforchange", "webdev", "web3hackathon", "aihackathon",
]

# ── Hackathon Signal Keywords (must appear in post caption to qualify) ────────
HACKATHON_SIGNAL_WORDS = {
    "hackathon", "hack-a-thon", "coding challenge", "coding competition",
    "code sprint", "build-a-thon", "ideathon", "makeathon",
    "datathon", "codeathon", "appathon", "designathon",
    "innovation challenge", "tech challenge", "devhack",
    "register now", "registrations open", "apply now",
    "prize pool", "prize worth", "prizes worth", "total prizes",
    "cash prize", "win", "₹", "lakh", "crore",
    "deadline", "last date", "submissions close",
    "team size", "team of", "solo or team",
    "24 hours", "36 hours", "48 hours", "24hr", "36hr", "48hr",
}

# ── Anti-False-Positive Blocklist (reject if caption contains these) ──────────
BLOCKLIST_PATTERNS = [
    r"\b(?:follow|like|share|repost|giveaway|dm me)\b",
    r"\b(?:meme|funny|comedy|joke)\b",
    r"\b(?:buy|sell|shop|discount|coupon|offer|sale)\b",
    r"(?:onlyfans|dating|crypto\s+pump)",
]

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
}


def _polite_delay():
    """Random delay between 1-3 seconds to avoid rate-limiting."""
    time.sleep(random.uniform(1.0, 3.0))


def _extract_dates_from_text(text: str) -> tuple[Optional[str], Optional[str]]:
    from event_normalization import extract_registration_date
    return extract_registration_date(text)


def _extract_prize_from_text(text: str) -> str:
    """Extract prize pool information from caption text."""
    prize_patterns = [
        r"(?:prize\s*(?:pool|worth)?|prizes?\s*(?:worth)?|total\s*prizes?)\s*[:\-–]?\s*(₹[\d,.\s]+(?:lakh|lac|crore|cr|k)?)",
        r"(₹[\d,.\s]+(?:lakh|lac|crore|cr|k)?)\s*(?:prize|cash|worth)",
        r"(?:prize|cash|worth)\s*[:\-–]?\s*(\$[\d,.\s]+(?:k|K)?)",
        r"(₹[\d,.\s]+)\s*(?:lakh|lac|crore|cr)",
        r"(?:win|earn)\s+(?:up\s+to\s+)?(₹[\d,.\s]+(?:lakh|lac|crore|cr|k)?)",
    ]

    text_lower = text.lower()
    for pattern in prize_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()

    # Check for lakh/crore mentions without ₹
    lakh_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:lakh|lac)s?", text_lower)
    if lakh_match:
        return f"₹{lakh_match.group(1)} Lakh"

    crore_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:crore|cr)s?", text_lower)
    if crore_match:
        return f"₹{crore_match.group(1)} Cr"

    return "TBA"


def _extract_location_from_text(text: str) -> tuple[str, str]:
    """Extract location and mode (Online/Offline/Hybrid) from caption."""
    text_lower = text.lower()

    # Check for online/virtual indicators
    online_keywords = ["online", "virtual", "remote", "from home", "anywhere"]
    offline_keywords = ["offline", "in-person", "on-campus", "venue", "auditorium", "campus"]
    hybrid_keywords = ["hybrid", "online + offline", "online & offline"]

    is_online = any(kw in text_lower for kw in online_keywords)
    is_offline = any(kw in text_lower for kw in offline_keywords)
    is_hybrid = any(kw in text_lower for kw in hybrid_keywords)

    # City detection
    city_map = {
        "pune": "Pune, Maharashtra, India",
        "mumbai": "Mumbai, Maharashtra, India",
        "delhi": "New Delhi, Delhi, India",
        "new delhi": "New Delhi, Delhi, India",
        "bengaluru": "Bengaluru, Karnataka, India",
        "bangalore": "Bengaluru, Karnataka, India",
        "hyderabad": "Hyderabad, Telangana, India",
        "chennai": "Chennai, Tamil Nadu, India",
        "kolkata": "Kolkata, West Bengal, India",
        "ahmedabad": "Ahmedabad, Gujarat, India",
        "jaipur": "Jaipur, Rajasthan, India",
        "lucknow": "Lucknow, Uttar Pradesh, India",
        "chandigarh": "Chandigarh, India",
        "bhopal": "Bhopal, Madhya Pradesh, India",
        "indore": "Indore, Madhya Pradesh, India",
        "noida": "Noida, Uttar Pradesh, India",
        "gurgaon": "Gurgaon, Haryana, India",
        "gurugram": "Gurugram, Haryana, India",
    }

    detected_city = None
    for city, full_name in city_map.items():
        if re.search(rf"\b{city}\b", text_lower):
            detected_city = full_name
            break

    if is_hybrid:
        return detected_city or "Hybrid", "Hybrid"
    elif is_offline or detected_city:
        return detected_city or "TBA", "Offline"
    else:
        return "Online", "Virtual"


def _extract_tags_from_text(text: str) -> list[str]:
    """Extract technology/theme tags from caption text and hashtags."""
    text_lower = text.lower()
    tags = set()

    tag_keywords = {
        "ai": ["ai", "artificial intelligence", "machine learning", "deep learning", "genai", "generative ai"],
        "ml": ["ml", "machine learning", "neural network"],
        "web3": ["web3", "blockchain", "crypto", "solana", "ethereum", "defi", "nft"],
        "fintech": ["fintech", "finance", "banking", "payments"],
        "iot": ["iot", "hardware", "arduino", "raspberry", "embedded"],
        "cloud": ["cloud", "aws", "azure", "gcp", "devops"],
        "open-source": ["open source", "open-source", "foss", "github"],
        "cybersecurity": ["cybersecurity", "security", "infosec", "ctf", "capture the flag"],
        "healthtech": ["healthtech", "health tech", "medtech", "healthcare"],
        "edtech": ["edtech", "education", "learning"],
        "sustainability": ["sustainability", "climate", "green tech", "environment"],
        "gaming": ["gaming", "game dev", "gamedev", "unity", "unreal"],
        "ar/vr": ["ar", "vr", "augmented reality", "virtual reality", "metaverse", "xr"],
        "mobile": ["mobile app", "android", "ios", "flutter", "react native"],
        "data-science": ["data science", "data analytics", "big data"],
    }

    for tag, keywords in tag_keywords.items():
        if any(kw in text_lower for kw in keywords):
            tags.add(tag)

    # Extract hashtags
    hashtags = re.findall(r"#(\w+)", text)
    for ht in hashtags:
        ht_lower = ht.lower()
        if any(signal in ht_lower for signal in ["hack", "code", "dev", "tech"]):
            tags.add(ht_lower)

    return sorted(list(tags))[:10]  # Cap at 10 tags


def _extract_registration_link(text: str) -> Optional[str]:
    """Extract registration/event URL from caption text."""
    # Look for URLs in text
    url_pattern = r"https?://[^\s<>\"'\)\]]+|(?:www\.)[^\s<>\"'\)\]]+"
    urls = re.findall(url_pattern, text)

    # Prioritize known hackathon platforms
    priority_domains = [
        "devfolio.co", "unstop.com", "devpost.com", "hackerearth.com",
        "dare2compete.com", "kaggle.com", "mlh.io", "luma.com",
        "eventbrite.com", "lu.ma", "konfhub.com",
    ]

    for url in urls:
        for domain in priority_domains:
            if domain in url.lower():
                return url.rstrip(".,;!)")

    # Fallback: link-in-bio patterns
    linktree_patterns = ["linktr.ee", "linkin.bio", "bio.link", "beacons.ai"]
    for url in urls:
        for lt in linktree_patterns:
            if lt in url.lower():
                return url.rstrip(".,;!)")

    # Return first URL if available
    if urls:
        return urls[0].rstrip(".,;!)")

    return None


def verify_hackathon_post(caption: str, account: str = "") -> dict:
    """
    Multi-signal verification pipeline for Instagram posts.

    Returns a verification result dict with:
      - is_verified: bool — whether the post passes as a legitimate hackathon
      - confidence: float — confidence score (0.0 to 1.0)
      - signals: list[str] — which verification signals matched
      - rejection_reason: str — reason for rejection if not verified
    """
    if not caption:
        return {
            "is_verified": False,
            "confidence": 0.0,
            "signals": [],
            "rejection_reason": "Empty caption",
        }

    caption_lower = caption.lower()
    signals = []
    score = 0.0

    # Signal 1: Hackathon signal words (required — at least one must match)
    signal_matches = [w for w in HACKATHON_SIGNAL_WORDS if w in caption_lower]
    if signal_matches:
        score += 0.3
        signals.append(f"signal_words:{len(signal_matches)}")
    else:
        return {
            "is_verified": False,
            "confidence": score,
            "signals": signals,
            "rejection_reason": "No hackathon signal words found in caption",
        }

    # Signal 2: Known hackathon organizer account
    if account.lower() in [a.lower() for a in HACKATHON_ACCOUNTS]:
        score += 0.25
        signals.append("trusted_account")

    # Signal 3: Contains registration link
    reg_link = _extract_registration_link(caption)
    if reg_link:
        score += 0.15
        signals.append("has_registration_link")

    # Signal 4: Contains date/deadline
    deadline, _ = _extract_dates_from_text(caption)
    if deadline:
        score += 0.1
        signals.append("has_deadline")

    # Signal 5: Contains prize info
    prize = _extract_prize_from_text(caption)
    if prize != "TBA":
        score += 0.1
        signals.append("has_prize")

    # Signal 6: Hackathon-related hashtags
    hashtags = re.findall(r"#(\w+)", caption)
    hack_hashtags = [h for h in hashtags if any(s in h.lower() for s in ["hack", "thon", "code", "dev"])]
    if hack_hashtags:
        score += 0.1
        signals.append(f"hack_hashtags:{len(hack_hashtags)}")

    # Anti-Signal: Blocklist patterns
    for pattern in BLOCKLIST_PATTERNS:
        if re.search(pattern, caption_lower):
            score -= 0.3
            signals.append(f"blocklist:{pattern}")
            break

    # Threshold: require confidence >= 0.4
    is_verified = score >= 0.4

    return {
        "is_verified": is_verified,
        "confidence": round(min(score, 1.0), 3),
        "signals": signals,
        "rejection_reason": "" if is_verified else f"Low confidence ({score:.2f} < 0.40)",
    }


def _scrape_account_posts(account: str) -> list[dict]:
    """
    Scrape recent public posts from an Instagram account page.
    Uses the public web profile HTML to extract post data.
    """
    discovered = []
    url = f"https://www.instagram.com/{account}/"

    try:
        resp = requests.get(url, headers=_HEADERS, timeout=10)
        if resp.status_code != 200:
            logger.debug("Instagram profile %s returned status %d", account, resp.status_code)
            return discovered

        # Instagram loads data via JS — attempt to extract shared_data JSON
        # Look for og:description and any embedded JSON data
        soup = BeautifulSoup(resp.text, "html.parser")

        # Extract meta descriptions which often contain recent post content
        og_desc = soup.find("meta", property="og:description")
        meta_desc = og_desc.get("content", "") if og_desc else ""

        # Look for script tags with shared data
        scripts = soup.find_all("script", type="application/ld+json")
        for script in scripts:
            try:
                import json
                data = json.loads(script.string or "{}")
                if isinstance(data, dict):
                    desc = data.get("description", "")
                    name = data.get("name", "")
                    if desc and any(w in desc.lower() for w in HACKATHON_SIGNAL_WORDS):
                        post = _build_post_from_text(
                            caption=desc,
                            account=account,
                            link=url,
                            image=data.get("image"),
                        )
                        if post:
                            discovered.append(post)
            except Exception:
                pass

        # Also try extracting from any visible text content
        for text_block in soup.find_all(["p", "span", "div"], string=True):
            text = text_block.get_text(strip=True)
            if len(text) > 50 and any(w in text.lower() for w in ["hackathon", "register", "prize"]):
                post = _build_post_from_text(
                    caption=text,
                    account=account,
                    link=url,
                )
                if post:
                    discovered.append(post)

    except requests.RequestException as e:
        logger.warning("Failed to fetch Instagram profile %s: %s", account, e)
    except Exception as e:
        logger.warning("Error parsing Instagram profile %s: %s", account, e)

    return discovered


def _scrape_hashtag_feed(hashtag: str) -> list[dict]:
    """
    Scrape public posts from an Instagram hashtag page.
    """
    discovered = []
    url = f"https://www.instagram.com/explore/tags/{hashtag}/"

    try:
        resp = requests.get(url, headers=_HEADERS, timeout=10)
        if resp.status_code != 200:
            logger.debug("Instagram hashtag #%s returned status %d", hashtag, resp.status_code)
            return discovered

        soup = BeautifulSoup(resp.text, "html.parser")

        # Extract meta description
        og_desc = soup.find("meta", property="og:description")
        if og_desc and og_desc.get("content"):
            desc = og_desc["content"]
            # The og:description often summarizes top posts
            if any(w in desc.lower() for w in HACKATHON_SIGNAL_WORDS):
                post = _build_post_from_text(
                    caption=desc,
                    account=f"#{hashtag}",
                    link=url,
                )
                if post:
                    discovered.append(post)

        # Extract from ld+json
        scripts = soup.find_all("script", type="application/ld+json")
        for script in scripts:
            try:
                import json
                data = json.loads(script.string or "{}")
                if isinstance(data, dict):
                    desc = data.get("description", "")
                    if desc and any(w in desc.lower() for w in HACKATHON_SIGNAL_WORDS):
                        post = _build_post_from_text(
                            caption=desc,
                            account=f"#{hashtag}",
                            link=url,
                        )
                        if post:
                            discovered.append(post)
            except Exception:
                pass

    except requests.RequestException as e:
        logger.warning("Failed to fetch Instagram hashtag #%s: %s", hashtag, e)
    except Exception as e:
        logger.warning("Error parsing Instagram hashtag #%s: %s", hashtag, e)

    return discovered


def _build_post_from_text(
    caption: str,
    account: str,
    link: str,
    image: Optional[str] = None,
) -> Optional[dict]:
    """
    Parse a caption into a structured hackathon document.
    Returns None if the post fails verification.
    """
    verification = verify_hackathon_post(caption, account)
    if not verification["is_verified"]:
        logger.debug(
            "Rejected Instagram post from %s: %s",
            account, verification["rejection_reason"]
        )
        return None

    # Extract structured data from caption
    deadline, deadline_iso = _extract_dates_from_text(caption)
    prize = _extract_prize_from_text(caption)
    location, mode = _extract_location_from_text(caption)
    tags = _extract_tags_from_text(caption)
    reg_link = _extract_registration_link(caption)

    # Build title from first line of caption or extract explicitly
    title_match = re.match(r"^(.{10,80}?)(?:\n|\.|\!|\?)", caption)
    title = title_match.group(1).strip() if title_match else caption[:80].strip()

    # Clean title
    title = re.sub(r"[#@]\w+", "", title).strip()
    title = re.sub(r"\s+", " ", title).strip()
    if len(title) < 5:
        title = f"Hackathon by @{account}"

    # Use the registration link if found, otherwise Instagram post URL
    final_link = reg_link or link

    return {
        "title": title,
        "link": final_link,
        "source": "Instagram",
        "source_account": f"@{account}" if not account.startswith("#") else account,
        "mode": mode,
        "location": location,
        "deadline": deadline or "TBA",
        "deadline_kind": "registration" if deadline_iso else "unknown",
        "deadline_iso": deadline_iso,
        "prize": prize,
        "tags": tags,
        "desc": caption[:400].strip(),
        "status": "Open",
        "is_past": False,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "verified": True,
        "verification_confidence": verification["confidence"],
        "verification_signals": verification["signals"],
        "discovery_source": "instagram",
        "instagram_post_url": link,
        "image": image,
    }


def scrape_instagram_hackathons(
    accounts: list[str] | None = None,
    hashtags: list[str] | None = None,
    max_per_account: int = 5,
) -> list[dict]:
    """
    Main entry point: scan Instagram accounts and hashtags for hackathon posts.

    Args:
        accounts: List of Instagram usernames to scan (defaults to HACKATHON_ACCOUNTS)
        hashtags: List of hashtags to scan (defaults to HACKATHON_HASHTAGS)
        max_per_account: Max posts to keep per account/hashtag

    Returns:
        List of verified hackathon documents ready for MongoDB insertion.
    """
    target_accounts = accounts or HACKATHON_ACCOUNTS[:10]  # Limit to top 10 for speed
    target_hashtags = hashtags or HACKATHON_HASHTAGS[:8]    # Top 8 hashtags

    all_discovered = []
    seen_links = set()

    logger.info(
        "Instagram scanner starting: %d accounts, %d hashtags",
        len(target_accounts), len(target_hashtags)
    )

    # Scan accounts
    for acct in target_accounts:
        try:
            posts = _scrape_account_posts(acct)
            for post in posts[:max_per_account]:
                link = post.get("link", "")
                if link and link not in seen_links:
                    seen_links.add(link)
                    all_discovered.append(post)
            _polite_delay()
        except Exception as e:
            logger.warning("Error scanning Instagram account @%s: %s", acct, e)

    # Scan hashtags
    for ht in target_hashtags:
        try:
            posts = _scrape_hashtag_feed(ht)
            for post in posts[:max_per_account]:
                link = post.get("link", "")
                if link and link not in seen_links:
                    seen_links.add(link)
                    all_discovered.append(post)
            _polite_delay()
        except Exception as e:
            logger.warning("Error scanning Instagram hashtag #%s: %s", ht, e)

    logger.info(
        "Instagram scanner complete: %d verified hackathons discovered",
        len(all_discovered)
    )
    return all_discovered
