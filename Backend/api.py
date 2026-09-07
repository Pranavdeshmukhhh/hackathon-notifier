import logging
import os
from datetime import datetime
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import sys

# Ensure utf-8 encoding for standard output
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

# Import the existing db module
from db.mongo_client import get_collection

# Rate limiter – 30 requests/min per IP
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="Hackathon Notifier API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS – restrict to actual frontend origin; no credentials needed
_frontend_url = os.getenv("FRONTEND_URL", "https://hackathon-notifier.vercel.app")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_frontend_url],
    allow_methods=["*"],
    allow_headers=["*"],
)

def _sort_hackathons(docs: list[dict]) -> list[dict]:
    """
    Sort hackathons: upcoming (soonest first) -> no date -> ended/past (most recent first).
    """
    today = datetime.utcnow().strftime("%Y-%m-%d")
    upcoming, no_date, past = [], [], []

    for doc in docs:
        iso = doc.get("deadline_iso", "")
        status = doc.get("status", "").lower()

        if iso and iso >= today and status != "ended":
            upcoming.append(doc)
        elif iso and (iso < today or status == "ended"):
            past.append(doc)
        elif status == "ended":
            past.append(doc)
        else:
            no_date.append(doc)

    upcoming.sort(key=lambda d: d.get("deadline_iso", "9999"))
    past.sort(key=lambda d: d.get("deadline_iso", ""), reverse=True)

    for doc in upcoming:
        doc["is_past"] = False
    for doc in no_date:
        doc["is_past"] = False
    for doc in past:
        doc["is_past"] = True

    return upcoming + no_date + past


@app.get("/")
@app.head("/")
def read_root():
    return {"message": "Hackathon API is running"}

@app.get("/api/hackathons")
@limiter.limit("30/minute")
def get_hackathons(request: Request):
    try:
        collection = get_collection()
        cursor = collection.find({}).limit(200)
        docs = []
        for doc in cursor:
            doc["_id"] = str(doc["_id"])
            docs.append(doc)

        sorted_docs = _sort_hackathons(docs)

        # Collect stats
        all_tags = set()
        sources = set()
        college_types = set()
        latest_scrape = ""
        top_college_count = 0
        internship_count = 0

        for doc in sorted_docs:
            for tag in doc.get("tags", []):
                all_tags.add(tag)
            sources.add(doc.get("source", "Unknown"))
            sa = doc.get("scraped_at", "")
            if sa > latest_scrape:
                latest_scrape = sa

            # Classification stats
            if doc.get("is_top_college"):
                top_college_count += 1
                ct = doc.get("college_type")
                if ct:
                    college_types.add(ct)
            if doc.get("is_internship"):
                internship_count += 1

        stats = {
            "total": len(sorted_docs),
            "unique_tags": len(all_tags),
            "sources": list(sources),
            "last_scraped": latest_scrape,
            "top_college_count": top_college_count,
            "internship_count": internship_count,
            "college_types": sorted(college_types),
        }

        return {"success": True, "count": len(sorted_docs), "data": sorted_docs, "stats": stats}
    except Exception as e:
        logger.error("Error fetching hackathons", exc_info=True)
        return {"success": False, "error": "Internal server error", "data": [], "stats": {}}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
