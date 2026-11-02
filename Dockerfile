# ── Hackathon Notifier Backend ────────────────────────────────────────────────
# Build:  docker build -t hackathon-notifier .
# Run:    docker run -p 10000:10000 --env-file Backend/.env hackathon-notifier
# ──────────────────────────────────────────────────────────────────────────────

FROM python:3.12-slim AS base

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Keep release installs reproducible. Optional CA is a build secret, never an image layer.
COPY Backend/requirements.lock .
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then \
      PIP_CERT=/run/secrets/proxy_ca python -m pip install --no-cache-dir -r requirements.lock; \
    else \
      python -m pip install --no-cache-dir -r requirements.lock; \
    fi

# Copy application code
COPY Backend/ .
COPY LICENSE ./LICENSE

# Create non-root user for security
RUN adduser --disabled-password --gecos "" appuser \
    && chmod -R a+rX /app
USER appuser

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import os,requests; s=requests.Session(); s.trust_env=False; s.get('http://127.0.0.1:'+str(int(os.getenv('PORT','10000')))+'/health',timeout=3).raise_for_status()"

CMD ["python", "unified_server.py"]
