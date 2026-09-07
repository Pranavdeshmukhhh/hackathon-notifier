"""
keyword_filter.py — Classify and filter hackathons for Top Indian Colleges & Internships.

Two independent functions:
  classify_hackathon(hackathon)          — enrich with college/internship metadata
  classify_all(hackathons)               — enrich ALL hackathons in-place (no filtering)
  filter_hackathons(hackathons)          — keep only top-college or internship entries
  is_duplicate(link, collection)         — True if link already in MongoDB
"""

import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)


# ── Top College Patterns ──────────────────────────────────────────────────────
# Each tuple: (compiled regex, college_type label)
# Word-boundary (\b) avoids false positives like "ignite" matching "nit".

_IIT_CAMPUSES = (
    "bombay|delhi|madras|kanpur|kharagpur|roorkee|guwahati|hyderabad|indore|"
    "bhu|varanasi|dhanbad|ism|ropar|rupnagar|patna|bhubaneswar|mandi|jodhpur|"
    "tirupati|palakkad|dharwad|bhilai|goa|jammu"
)
_NIT_CAMPUSES = (
    "trichy|tiruchirappalli|surathkal|warangal|rourkela|calicut|jamshedpur|"
    "kurukshetra|hamirpur|raipur|durgapur|allahabad|prayagraj|nagpur|silchar|"
    "srinagar|jaipur|bhopal|patna|agartala|arunachal|delhi|goa|manipur|"
    "meghalaya|mizoram|nagaland|puducherry|sikkim|uttarakhand"
)
_IIIT_CAMPUSES = (
    "hyderabad|bangalore|bengaluru|delhi|allahabad|prayagraj|gwalior|jabalpur|"
    "kancheepuram|lucknow|kurnool|sri city|vadodara|sonepat|nagpur|pune|"
    "ranchi|una|kalyani|bhopal|dharwad|tiruchirappalli|trichy|kottayam|"
    "manipur|raichur|agartala|bhagalpur|surat"
)
_BITS_CAMPUSES = "pilani|goa|hyderabad|dubai"

_COLLEGE_PATTERNS: list[tuple[re.Pattern, str]] = [
    # IIT — full forms and abbreviations
    (re.compile(
        r"\b(?:iit\b|iits\b|indian\s+institute\s+of\s+technology)"
        rf"(?:\s+(?:{_IIT_CAMPUSES}))?",
        re.IGNORECASE,
    ), "IIT"),
    # NIT — full forms and abbreviations
    (re.compile(
        r"\b(?:nit\b|nits\b|national\s+institute\s+of\s+technology)"
        rf"(?:\s+(?:{_NIT_CAMPUSES}))?",
        re.IGNORECASE,
    ), "NIT"),
    # IIIT — full forms and abbreviations
    (re.compile(
        r"\b(?:iiit\b|iiits\b|indian\s+institute\s+of\s+information\s+technology)"
        rf"(?:\s+(?:{_IIIT_CAMPUSES}))?",
        re.IGNORECASE,
    ), "IIIT"),
    # BITS Pilani
    (re.compile(
        r"\b(?:bits\b|birla\s+institute\s+of\s+technology\s+(?:and|&)\s+science)"
        rf"(?:\s+(?:{_BITS_CAMPUSES}))?",
        re.IGNORECASE,
    ), "BITS"),
    # IISc
    (re.compile(
        r"\b(?:iisc\b|indian\s+institute\s+of\s+science)",
        re.IGNORECASE,
    ), "IISc"),
    # IIM
    (re.compile(
        r"\b(?:iim\b|iims\b|indian\s+institute\s+of\s+management)",
        re.IGNORECASE,
    ), "IIM"),
    # DTU / NSUT / DCE (Delhi CFTIs)
    (re.compile(
        r"\b(?:dtu\b|delhi\s+technological\s+university|"
        r"nsut\b|netaji\s+subhas\s+(?:university|institute)|"
        r"dce\b|delhi\s+college\s+of\s+engineering)",
        re.IGNORECASE,
    ), "CFTI"),
]

# ── Internship / Hiring Patterns ─────────────────────────────────────────────
_INTERNSHIP_PATTERN = re.compile(
    r"\b(?:internship|intern\b|hiring\s+challenge|placement|job\s+offer|"
    r"ppo\b|ppi\b|stipend|career\s+track|hiring|recruit)",
    re.IGNORECASE,
)


# ── Classification ────────────────────────────────────────────────────────────

def classify_hackathon(hackathon: dict) -> dict:
    """
    Enrich a hackathon dict with college and internship classification metadata.

    Searches across title, tags, location, tagline, and description.
    Adds:
      is_top_college  (bool)
      college_type    ("IIT" | "NIT" | "IIIT" | "BITS" | "IISc" | "IIM" | "CFTI" | None)
      college_name    (str | None)  — matched text, e.g. "NIT Raipur"
      is_internship   (bool)
      opportunity_type (str)        — "Hackathon" | "Internship" | "Hiring Challenge"

    Returns the same dict (mutated in-place for speed).
    """
    # Build a combined search string from all relevant fields
    parts = [
        hackathon.get("title", ""),
        " ".join(hackathon.get("tags", [])),
        hackathon.get("location", ""),
        hackathon.get("tagline", ""),
        hackathon.get("desc", ""),
    ]
    haystack = " ".join(parts)

    # ── College detection ─────────────────────────────────────────────────
    is_top_college = False
    college_type = None
    college_name = None

    for pattern, ctype in _COLLEGE_PATTERNS:
        match = pattern.search(haystack)
        if match:
            is_top_college = True
            college_type = ctype
            college_name = match.group(0).strip()
            break  # first match wins (IIT > NIT > IIIT > BITS > IISc > IIM > CFTI)

    # ── Internship detection ──────────────────────────────────────────────
    is_internship = bool(_INTERNSHIP_PATTERN.search(haystack))

    # ── Opportunity type ──────────────────────────────────────────────────
    title_lower = hackathon.get("title", "").lower()
    if "hiring" in title_lower or "challenge" in title_lower:
        opportunity_type = "Hiring Challenge"
    elif is_internship:
        opportunity_type = "Internship"
    else:
        opportunity_type = "Hackathon"

    hackathon["is_top_college"] = is_top_college
    hackathon["college_type"] = college_type
    hackathon["college_name"] = college_name
    hackathon["is_internship"] = is_internship
    hackathon["opportunity_type"] = opportunity_type

    return hackathon


# ── Classify all (no filtering) ───────────────────────────────────────────────

def classify_all(hackathons: list[dict]) -> list[dict]:
    """
    Classify ALL hackathons in-place with college/internship metadata.
    Does NOT filter — every item is enriched and returned.

    Returns:
        The same list with enriched metadata on each item.
    """
    if not hackathons:
        return []

    logger.info("Classifying %d hackathons (no filter)…", len(hackathons))
    for h in hackathons:
        classify_hackathon(h)

    top_college = sum(1 for h in hackathons if h.get("is_top_college"))
    internship = sum(1 for h in hackathons if h.get("is_internship"))
    both = sum(1 for h in hackathons if h.get("is_top_college") and h.get("is_internship"))

    logger.info(
        "Classification complete: %d total (top_college=%d, internship=%d, both=%d).",
        len(hackathons), top_college, internship, both,
    )
    return hackathons


# ── Filter ─────────────────────────────────────────────────────────────────────

def filter_hackathons(hackathons: list[dict]) -> list[dict]:
    """
    Classify all hackathons and keep only those from top Indian colleges
    or offering internship/hiring opportunities.

    Returns:
        Filtered list with enriched metadata.
    """
    if not hackathons:
        return []

    logger.info("Classifying %d hackathons…", len(hackathons))

    matched = []
    for h in hackathons:
        classify_hackathon(h)
        if h["is_top_college"] or h["is_internship"]:
            matched.append(h)

    logger.info(
        "Classification complete: %d/%d matched (top_college=%d, internship=%d, both=%d).",
        len(matched),
        len(hackathons),
        sum(1 for h in matched if h["is_top_college"]),
        sum(1 for h in matched if h["is_internship"]),
        sum(1 for h in matched if h["is_top_college"] and h["is_internship"]),
    )
    return matched


# ── Duplicate check ────────────────────────────────────────────────────────────

def is_duplicate(link: str, collection) -> bool:
    """
    Return True if *link* already exists in the MongoDB collection.

    Treats empty links and unavailable collections as duplicates
    (safe-fail: skip insertion rather than crash or insert garbage).

    Args:
        link:       Hackathon URL to check.
        collection: PyMongo Collection object (from get_collection()).

    Returns:
        bool — True = skip, False = new entry.
    """
    if not link:
        logger.warning("is_duplicate: empty link — treating as duplicate (skip).")
        return True

    if collection is None:
        logger.error("is_duplicate: collection is None — cannot check; treating as duplicate.")
        return True

    try:
        # Project only _id — faster than fetching the full document
        return collection.find_one({"link": link}, {"_id": 1}) is not None
    except Exception:
        logger.exception("is_duplicate: MongoDB query failed for link=%s", link)
        # Safer to skip insertion than to risk a crash or duplicate
        return True


# ── Self-test ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s", stream=sys.stdout)

    samples = [
        {"title": "IIT Bombay Hackathon", "tags": ["AI"], "link": "https://a.com"},
        {"title": "Cooking Contest", "tags": ["Food"], "link": "https://b.com"},
        {"title": "NIT Trichy CodeFest", "tags": ["Web"], "link": "https://c.com"},
        {"title": "Sports Cup", "tags": ["Sports"], "link": "https://d.com"},
        {"title": "Internship Hiring Challenge", "tags": ["Coding"], "link": "https://e.com"},
        {"title": "Random Online Hack", "tags": ["Blockchain"], "link": "https://f.com"},
        {"title": "IIIT Hyderabad Felicity", "tags": ["Tech"], "link": "https://g.com"},
        {"title": "Codeutsava", "tags": ["Open Innovation"], "link": "https://h.com",
         "location": "NIT Raipur, Great Eastern Road, Raipur, Chhattisgarh, India"},
        {"title": "BITS Pilani Hackathon", "tags": ["ML"], "link": "https://i.com"},
        {"title": "DTU TechFest Hack", "tags": ["Robotics"], "link": "https://j.com"},
    ]

    # Test classify_all — enriches everything
    enriched = classify_all(samples.copy())
    print(f"\nclassify_all: {len(enriched)} enriched (all returned)")
    for h in enriched:
        print(f"  {'✓' if h['is_top_college'] or h['is_internship'] else '·'} "
              f"{h['title']}  |  college={h['college_type']}  internship={h['is_internship']}")

    # Test filter_hackathons — only matching items
    filtered = filter_hackathons(samples)
    print(f"\nfilter_hackathons: {len(filtered)} matched out of {len(samples)}")
    for h in filtered:
        print(f"  ✓ {h['title']}  |  college={h['college_type']}  internship={h['is_internship']}")

    # Expect: IIT Bombay, NIT Trichy, Internship Hiring, IIIT Hyderabad, Codeutsava (NIT Raipur),
    #         BITS Pilani, DTU TechFest = 7 matches
    assert len(filtered) == 7, f"Expected 7, got {len(filtered)}"
    print("\nAll assertions passed ✓")

    assert is_duplicate("", None) is True
    assert is_duplicate("https://x.com", None) is True
    print("is_duplicate: PASS")

    sys.exit(0)
