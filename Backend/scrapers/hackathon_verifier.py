"""
hackathon_verifier.py — Unified Hackathon Verification Engine.

Multi-signal verification pipeline that validates whether a discovered
hackathon listing is legitimate before it gets indexed into the database.

Verification Signals:
  1. Title Analysis   — Is the title plausibly a hackathon name?
  2. URL Validation   — Is the URL from a trusted domain or reachable?
  3. Content Analysis  — Does the page/description mention hackathon keywords?
  4. Date Validation   — Are dates in the future (not already expired)?
  5. Duplicate Check   — Is this already in the database?
  6. Spam Detection    — Does it contain spam/scam patterns?
  7. Source Trust      — Is the source platform known and trusted?

Each signal contributes a score. Items with total score >= threshold
are marked as verified.
"""

import logging
import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

from safe_http import public_request, validate_public_url, UnsafeURL

logger = logging.getLogger("hackathon_verifier")

# ── Trusted Hackathon Platform Domains ───────────────────────────────────────
TRUSTED_DOMAINS = {
    "devfolio.co": 0.95,
    "unstop.com": 0.95,
    "devpost.com": 0.95,
    "hackerearth.com": 0.90,
    "dare2compete.com": 0.90,
    "kaggle.com": 0.90,
    "mlh.io": 0.95,
    "lu.ma": 0.80,
    "luma.com": 0.80,
    "konfhub.com": 0.85,
    "eventbrite.com": 0.75,
    "eventbrite.in": 0.75,
    "meetup.com": 0.70,
    "techfest.org": 0.85,
    "hackon.live": 0.80,
    "hackclub.com": 0.85,
}

# ── Known Spam/Scam Patterns ────────────────────────────────────────────────
SPAM_PATTERNS = [
    r"(?:buy|sell|shop|discount|coupon|offer|sale)\s+(?:now|today)",
    r"(?:onlyfans|dating|crypto\s*pump|get\s*rich\s*quick)",
    r"(?:click\s+here\s+to\s+win|congratulations\s+you\s+won)",
    r"(?:100%\s+guaranteed|no\s+risk|limited\s+time\s+offer)",
    r"(?:work\s+from\s+home\s+earn|make\s+money\s+fast)",
    r"(?:free\s+iphone|free\s+gift\s+card|whatsapp\s+forward)",
]

# ── Hackathon Title Patterns ────────────────────────────────────────────────
TITLE_POSITIVE_PATTERNS = [
    r"hack(?:athon|a-thon|fest|day|night|week)",
    r"(?:code|coding)\s*(?:sprint|jam|challenge|fest)",
    r"(?:build|make|create|design|innovate)\s*(?:athon|a-thon)",
    r"(?:idea|data|app|game|web|ai|ml)\s*(?:thon|athon)",
    r"(?:challenge|competition|contest|championship)",
    r"(?:tech\s*fest|innovation\s*summit)",
]

TITLE_NEGATIVE_PATTERNS = [
    r"^(?:test|example|demo|sample|placeholder)",
    r"(?:tutorial|course|lecture|webinar|workshop)\s*(?:on|about|for)",
]


def verify_hackathon(
    doc: dict,
    check_url: bool = True,
    check_db: bool = False,
    db_collection=None,
) -> dict:
    """
    Run multi-signal verification on a hackathon document.

    Args:
        doc: Hackathon document dict with at least 'title' and 'link'
        check_url: Whether to do a live HTTP check on the URL
        check_db: Whether to check for duplicates in MongoDB
        db_collection: MongoDB collection for duplicate checking

    Returns:
        dict with:
          - is_verified: bool
          - confidence: float (0.0 - 1.0)
          - signals: dict[str, float] — individual signal scores
          - issues: list[str] — problems found
          - recommendation: str — "accept", "review", or "reject"
    """
    title = (doc.get("title") or "").strip()
    link = (doc.get("link") or "").strip()
    desc = (doc.get("desc") or "").strip()
    source = (doc.get("source") or "").strip()
    deadline_iso = doc.get("deadline_iso")

    signals = {}
    issues = []
    total_score = 0.0

    # ── Signal 1: Title Analysis (0-0.20) ────────────────────────────────────
    title_score = _score_title(title)
    signals["title_quality"] = title_score
    total_score += title_score * 0.20
    if title_score < 0.3:
        issues.append(f"Weak title signal ({title_score:.2f})")

    # ── Signal 2: URL Domain Trust (0-0.25) ──────────────────────────────────
    domain_score = _score_domain(link)
    signals["domain_trust"] = domain_score
    total_score += domain_score * 0.25
    if domain_score < 0.3:
        issues.append(f"Untrusted domain ({urlparse(link).netloc})")

    # ── Signal 3: Content Analysis (0-0.20) ──────────────────────────────────
    content_score = _score_content(title, desc)
    signals["content_relevance"] = content_score
    total_score += content_score * 0.20
    if content_score < 0.3:
        issues.append("Low content relevance to hackathons")

    # ── Signal 4: Date Validation (0-0.15) ───────────────────────────────────
    date_score = _score_date(deadline_iso)
    signals["date_validity"] = date_score
    total_score += date_score * 0.15

    # ── Signal 5: Spam Detection (0-0.10) ────────────────────────────────────
    spam_score = _score_spam(f"{title} {desc}")
    signals["spam_check"] = spam_score
    total_score += spam_score * 0.10
    if spam_score < 0.5:
        issues.append("Potential spam content detected")

    # ── Signal 6: Source Trust (0-0.10) ──────────────────────────────────────
    source_score = _score_source(source)
    signals["source_trust"] = source_score
    total_score += source_score * 0.10

    # ── Signal 7: URL Liveness (optional, async-safe) ────────────────────────
    if check_url and link:
        url_live_score = _score_url_liveness(link)
        signals["url_liveness"] = url_live_score
        # Adjust total: bonus if live, penalty if dead
        if url_live_score < 0.3:
            total_score -= 0.1
            issues.append("URL is unreachable or returns error")
        else:
            total_score += 0.05  # Small bonus for live URL

    # ── Signal 8: Duplicate Check (optional) ─────────────────────────────────
    if check_db and db_collection and link:
        existing = db_collection.find_one({"link": link})
        if existing:
            signals["duplicate_check"] = 0.0
            issues.append("Duplicate: already indexed in database")
            return {
                "is_verified": False,
                "confidence": 0.0,
                "signals": signals,
                "issues": issues,
                "recommendation": "reject",
                "reason": "duplicate",
            }

    # ── Final Verdict ────────────────────────────────────────────────────────
    total_score = max(0.0, min(1.0, total_score))

    if total_score >= 0.55:
        recommendation = "accept"
        is_verified = True
    elif total_score >= 0.35:
        recommendation = "review"
        is_verified = True  # Accept but flag for manual review
    else:
        recommendation = "reject"
        is_verified = False

    return {
        "is_verified": is_verified,
        "confidence": round(total_score, 3),
        "signals": signals,
        "issues": issues,
        "recommendation": recommendation,
    }


def _score_title(title: str) -> float:
    """Score title quality (0.0 - 1.0)."""
    if not title or len(title) < 5:
        return 0.0

    score = 0.3  # Base score for having a title

    # Positive patterns
    for pattern in TITLE_POSITIVE_PATTERNS:
        if re.search(pattern, title, re.IGNORECASE):
            score += 0.3
            break

    # Negative patterns
    for pattern in TITLE_NEGATIVE_PATTERNS:
        if re.search(pattern, title, re.IGNORECASE):
            score -= 0.4

    # Length quality
    if 10 <= len(title) <= 100:
        score += 0.2
    elif len(title) > 100:
        score += 0.1

    # All caps penalty
    if title.isupper() and len(title) > 10:
        score -= 0.1

    return max(0.0, min(1.0, score))


def _score_domain(url: str) -> float:
    """Score URL domain trust (0.0 - 1.0)."""
    if not url:
        return 0.0

    try:
        domain = urlparse(validate_public_url(url)).hostname.lower()
    except UnsafeURL:
        return 0.0

    # Check trusted domains
    for trusted, trust_score in TRUSTED_DOMAINS.items():
        if domain == trusted or domain.endswith("." + trusted):
            return trust_score

    # Instagram has moderate trust
    if domain == "instagram.com" or domain.endswith(".instagram.com"):
        return 0.60

    # .edu domains are highly trusted
    if domain.endswith(".edu") or domain.endswith(".ac.in"):
        return 0.85

    # .org domains have moderate trust
    if domain.endswith(".org"):
        return 0.65

    # Other domains get a base trust score
    return 0.40


def _score_content(title: str, desc: str) -> float:
    """Score content relevance to hackathons (0.0 - 1.0)."""
    combined = f"{title} {desc}".lower()
    if not combined.strip():
        return 0.0

    score = 0.0
    hackathon_keywords = [
        "hackathon", "hack", "challenge", "competition", "coding",
        "register", "registration", "prize", "team", "build",
        "innovation", "code", "develop", "project", "submit",
        "deadline", "application", "participate",
    ]

    matches = sum(1 for kw in hackathon_keywords if kw in combined)
    if matches >= 5:
        score = 1.0
    elif matches >= 3:
        score = 0.8
    elif matches >= 2:
        score = 0.6
    elif matches >= 1:
        score = 0.4
    else:
        score = 0.1

    return score


def _score_date(deadline_iso: Optional[str]) -> float:
    """Score date validity (0.0 - 1.0)."""
    if not deadline_iso:
        return 0.5  # Unknown date is neutral

    try:
        deadline = datetime.strptime(deadline_iso, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)

        if deadline < now:
            return 0.1  # Past date — likely expired
        elif (deadline - now).days > 365:
            return 0.3  # Very far future — suspicious
        else:
            return 1.0  # Valid future date

    except (ValueError, TypeError):
        return 0.4  # Unparseable date — neutral


def _score_spam(text: str) -> float:
    """Score spam likelihood (1.0 = clean, 0.0 = spam)."""
    if not text:
        return 0.5

    text_lower = text.lower()
    spam_count = 0

    for pattern in SPAM_PATTERNS:
        if re.search(pattern, text_lower):
            spam_count += 1

    if spam_count >= 3:
        return 0.0
    elif spam_count >= 2:
        return 0.2
    elif spam_count >= 1:
        return 0.5
    else:
        return 1.0


def _score_source(source: str) -> float:
    """Score source platform trust (0.0 - 1.0)."""
    if not source:
        return 0.3

    trusted_sources = {
        "devfolio": 1.0, "unstop": 1.0, "devpost": 1.0,
        "hackerearth": 0.95, "mlh": 0.95, "instagram": 0.60,
        "eventbrite": 0.75, "konfhub": 0.80, "web discovery": 0.50,
        "community / direct": 0.50, "community / auto-listed": 0.50,
    }

    source_lower = source.lower()
    for key, score in trusted_sources.items():
        if key in source_lower:
            return score

    return 0.40


def _score_url_liveness(url: str) -> float:
    """Check if URL is live and returns a valid response."""
    try:
        resp = public_request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; HackathonVerifier/1.0)",
            },
            timeout=5,
            method="HEAD", max_bytes=0,
        )
        if resp.status_code < 400:
            return 1.0
        elif resp.status_code < 500:
            return 0.3  # Client error (404, etc.)
        else:
            return 0.1  # Server error
    except Exception:
        return 0.2  # Network error


def batch_verify(docs: list[dict], **kwargs) -> list[dict]:
    """
    Verify a batch of hackathon documents.

    Returns:
        The same list but each doc is enriched with verification metadata:
          - doc["verified"]: bool
          - doc["verification_confidence"]: float
          - doc["verification_signals"]: dict
          - doc["verification_recommendation"]: str
    """
    verified_docs = []

    for doc in docs:
        result = verify_hackathon(doc, **kwargs)
        doc["verified"] = result["is_verified"]
        doc["verification_confidence"] = result["confidence"]
        doc["verification_signals"] = list(result["signals"].keys())
        doc["verification_recommendation"] = result["recommendation"]

        if result["is_verified"]:
            verified_docs.append(doc)
        else:
            logger.debug(
                "Rejected: '%s' (confidence=%.2f, issues=%s)",
                doc.get("title", "?"), result["confidence"], result["issues"]
            )

    logger.info(
        "Verification complete: %d/%d accepted",
        len(verified_docs), len(docs)
    )
    return verified_docs
