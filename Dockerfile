# ── Hackathon Notifier Backend ────────────────────────────────────────────────
# Build:  docker build -t hackathon-notifier .
# Run:    docker run -p 10000:10000 --env-file Backend/.env hackathon-notifier
# ──────────────────────────────────────────────────────────────────────────────

FROM python:3.12-slim AS base

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies first (layer caching — only rebuilds when requirements change)
COPY Backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY Backend/ .

# Create non-root user for security
RUN adduser --disabled-password --gecos "" appuser
USER appuser

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:10000/health', timeout=3).raise_for_status()"

CMD ["python", "unified_server.py"]
