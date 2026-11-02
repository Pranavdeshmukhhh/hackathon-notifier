"""Isolated browser QA server. Sample events are never part of production builds."""
import os
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "Backend"))
os.environ.update(MONGO_URI="mongodb://127.0.0.1/isolated_preview", TELEGRAM_BOT_TOKEN="", TELEGRAM_CHAT_ID="",
                  ENABLE_BACKGROUND_SCANNER="false", TRACK_VISITORS="false", ENVIRONMENT="development", ADMIN_SECRET="")
import mongomock
import uvicorn
import api

preview_db = mongomock.MongoClient().isolated_preview
api.get_collection = lambda name="hackathons": preview_db[name]
now = datetime.now(timezone.utc)
# Intentional sample names and data; no live events, deadlines, or records.
samples = [
    ("Sample · Build for Tomorrow", "Devfolio", "Offline", "Bengaluru", "AI for a better everyday. Bring your idea and build it with a community of makers.", "₹2,00,000", ["AI / ML", "Open innovation"]),
    ("Sample · The Open Innovation Sprint", "Unstop", "Virtual", "Online", "A weekend of ambitious ideas, collaborative experiments, and real-world impact.", "₹1,50,000", ["Sustainability", "Web"]),
    ("Sample · Code Beyond Boundaries", "Devpost", "Hybrid", "Pune", "Prototype something unexpected. Explore fresh approaches to familiar problems.", "$5,000", ["Open innovation", "Web3"]),
    ("Sample · Campus Creators", "HackerEarth", "Offline", "Mumbai", "Meet fellow student builders and take your first idea from sketch to working prototype.", "₹75,000", ["Student", "Social impact"]),
    ("Sample · AI for Everyone", "Devfolio", "Virtual", "Online", "Make useful AI accessible. Build tools that help people learn, connect, and create.", "₹1,00,000", ["AI / ML", "Education"]),
    ("Sample · Future of Fintech", "Unstop", "Offline", "New Delhi", "Reimagine financial tools with a focus on accessibility and a better user experience.", "₹3,00,000", ["Fintech", "Web"]),
]
for i in range(27):
    title, source, mode, location, desc, prize, tags = samples[i % len(samples)]
    deadline = (now + timedelta(days=2 + i)).date().isoformat()
    preview_db.hackathons.insert_one({"title": title if i < 6 else f"{title} #{i + 1}", "source": source,
        "mode": mode, "location": location, "desc": desc, "prize": prize, "tags": tags,
        "deadline_iso": deadline, "deadline": deadline, "deadline_kind": "registration",
        "registration_deadline": {"date": deadline}, "status": "Open",
        "link": f"https://example.com/sample-event-{i + 1}", "min_team_size": 2, "max_team_size": 4,
        "lat": 18.5204 if location == "Pune" else 12.9716, "lng": 73.8567 if location == "Pune" else 77.5946})
if __name__ == "__main__":
    print("ISOLATED QA: 27 sample events in memory. No scanner, tracking, notifications, or live database.")
    uvicorn.run(api.app, host="127.0.0.1", port=8000)
