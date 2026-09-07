# Hackathon Notification Bot & Dashboard

An end-to-end data aggregation pipeline and full-stack application that automatically discovers active hackathons across multiple platforms and notifies users via a Telegram Bot and a web dashboard.

## 🚀 Overview

Developers frequently miss out on coding opportunities because hackathons are fragmented across multiple platforms. This project solves that by programmatically aggregating data from the top hackathon platforms, bypassing bot-protection mechanisms, and centralizing the opportunities.

### Key Features:
- **Concurrent Scraping Pipeline:** Uses `ThreadPoolExecutor` to simultaneously fetch data from Devfolio, Unstop, Devpost, and HackerEarth, minimizing I/O bottlenecks.
- **Advanced Bot-Bypass:** Implements TLS fingerprint spoofing (via `curl_cffi`) to successfully bypass enterprise Web Application Firewalls (e.g., Cloudflare) on platforms like Unstop.
- **Idempotent Storage:** Utilizes MongoDB with unique constraints to handle data deduplication gracefully, preventing duplicate notifications even if the pipeline runs multiple times.
- **Full-Stack Deployment:** The data is served via a FastAPI backend (deployed on Render) and visualized on a React dashboard (deployed on Vercel), with push notifications powered by the Telegram Bot API.

## 🛠️ Tech Stack

- **Backend:** Python, FastAPI
- **Database:** MongoDB (Motor / PyMongo)
- **Scraping:** BeautifulSoup, `curl_cffi`, Requests
- **Concurrency:** `concurrent.futures.ThreadPoolExecutor`
- **Frontend:** React (Vite)
- **Notifications:** Telegram Bot API
- **Infrastructure:** Render (Backend), Vercel (Frontend)

## ⚠️ Disclaimer & Known Limitations

*In the spirit of honest engineering, here are the current architectural flaws and limitations of this system:*

1. **Scraping Fragility:** This system relies heavily on undocumented APIs and HTML DOM structures. If platforms like Unstop or Devfolio update their UI or tighten their Cloudflare rules, the scrapers will temporarily break.
2. **Scalability Bottleneck (No Pub/Sub):** The notification engine currently iterates and sends Telegram messages in batches. It lacks a dedicated message broker (like RabbitMQ or Kafka). If the bot scales to thousands of subscribers, the synchronous sending loop will encounter rate limits and timeout issues.
3. **Cron Job vs. Event-Driven:** The backend relies on a long-running polling loop (`time.sleep`) rather than a serverless, event-driven architecture (e.g., AWS Lambda + EventBridge). This consumes unnecessary compute resources during idle times.
4. **Missing Caching Layer:** Every frontend request hits the MongoDB database directly. A production-grade system would require a caching layer (like Redis) to reduce database read latency and handle high-throughput traffic.
5. **No Automated CI/CD:** The deployment process currently lacks automated unit testing (`pytest`) and CI/CD pipelines (e.g., GitHub Actions) to verify scraper health before deployment.

## 💡 Future Scope
- Transition the notification engine to an asynchronous worker queue (Celery/RabbitMQ).
- Implement personalized user preferences in the Telegram Bot (e.g., "Only notify me for AI hackathons").
- Add exponential backoff and retry logic to gracefully handle temporary API rate limits.
