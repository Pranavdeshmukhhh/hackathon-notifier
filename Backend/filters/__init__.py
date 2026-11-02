"""
Backend/filters package — Keyword classification and filtering engine for premier institutes and internships.
"""

from .keyword_filter import (
    classify_hackathon,
    classify_all,
    filter_hackathons,
    is_duplicate,
)

__all__ = [
    "classify_hackathon",
    "classify_all",
    "filter_hackathons",
    "is_duplicate",
]
