"""Shared pytest fixtures and configuration."""
import sys
from pathlib import Path

# Ensure Backend/ is on sys.path so that `from scrapers.X import Y` works
# when pytest is invoked from the repo root.
_backend = Path(__file__).resolve().parent.parent
if str(_backend) not in sys.path:
    sys.path.insert(0, str(_backend))
