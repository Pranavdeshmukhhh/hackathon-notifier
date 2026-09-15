# Contributing to Hackathon Notifier

Thank you for your interest in contributing to **Hackathon Notifier**! We welcome contributions from developers of all skill levels, especially engineering students building tools for the developer community.

This document provides guidelines and workflows for contributing code, tests, documentation, and scraper modules.

---

## 📋 Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
   - [Prerequisites](#prerequisites)
   - [Local Setup](#local-setup)
   - [Docker Setup](#docker-setup)
3. [Architecture Overview](#architecture-overview)
4. [Adding a New Scraper](#adding-a-new-scraper)
5. [Coding Standards](#coding-standards)
   - [Backend (Python)](#backend-python)
   - [Frontend (React 19 + Vite)](#frontend-react-19--vite)
6. [Testing & Quality Assurance](#testing--quality-assurance)
7. [Submitting a Pull Request](#submitting-a-pull-request)
8. [Reporting Security Vulnerabilities](#reporting-security-vulnerabilities)

---

## 🤝 Code of Conduct

We are committed to providing a friendly, safe, and welcoming environment for everyone, regardless of experience level, background, or identity. Please be respectful and constructive in issues and pull request discussions.

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.12+**
- **Node.js 20+** and **npm 10+**
- **MongoDB 7.0+** (or MongoDB Atlas connection string)
- **Git**

### Local Setup

#### 1. Clone the repository
```bash
git clone https://github.com/Pranavdeshmukhhh/hackathon-notifier.git
cd hackathon-notifier
```

#### 2. Backend Setup
```bash
cd Backend
python -m venv .venv

# On Linux/macOS:
source .venv/bin/activate
# On Windows:
.venv\Scripts\activate

pip install -r requirements.txt
cp .env.example .env
# Edit .env with your MONGO_URI and TELEGRAM credentials
```

Run tests to verify the installation:
```bash
python -m pytest tests/ -v
```

Start the local development server:
```bash
python unified_server.py
# Backend runs at http://localhost:8000
# OpenAPI Docs at http://localhost:8000/docs
```

#### 3. Frontend Setup
```bash
cd ../Frontend
npm install
npm run dev
# Frontend runs at http://localhost:5173
```

### Docker Setup

You can run MongoDB and the Backend together with Docker Compose:

```bash
docker-compose up --build
```

---

## 🏛️ Architecture Overview

The system is decoupled into:

- **Scraper Engine (`Backend/scrapers/`)**: Multi-source scrapers (`ThreadPoolExecutor` concurrent sweeps across Devfolio, Unstop, Devpost, HackerEarth, Devnovate) with exponential backoff and proxy resilience.
- **Classification & Normalization (`Backend/filters/`)**: Regex keyword classification tagging Top Colleges (IIT, NIT, IIIT, BITS) and PPI/internship opportunities.
- **Data Persistence (`Backend/db/`)**: MongoDB Atlas with unique constraint on `link` to guarantee zero-duplicate ingestion.
- **API Server (`Backend/api.py`)**: FastAPI application with in-memory TTLCache, ETag conditional 304 validation, SlowAPI rate limiting, security middleware, and Pydantic response models (`Backend/schemas.py`).
- **Notification Daemon (`Backend/notifier/`)**: Interactive Telegram bot with pagination, search, distance filtering, and subscriber broadcast.
- **Frontend SPA (`Frontend/src/`)**: React 19 + Tailwind CSS single-page interface with glassmorphic Apple HIG design, custom hooks (`useDarkMode`, `useGeolocation`, `useScrollProgress`), skeleton loaders, and error boundaries.

---

## 🔌 Adding a New Scraper

To add a new discovery source (e.g. `MLH`, `Kaggle`, `Major League Hacking`):

1. **Create the scraper module**: Place it in `Backend/scrapers/<source>_scraper.py`.
2. **Implement the scraper interface**:
   ```python
   def scrape_mysource() -> list[dict]:
       """
       Returns a list of standardized hackathon dictionaries:
       {
           "title": str,
           "link": str,
           "source": "MySource",
           "deadline": str,
           "deadline_iso": "YYYY-MM-DD",
           "mode": "Online" | "Offline",
           "location": str,
           "tags": list[str],
           "prize": str,
           "desc": str,
       }
       """
   ```
3. **Register the scraper** in:
   - `Backend/scrapers/__init__.py`
   - `Backend/main.py` (`ALL_SCRAPERS` registry)
4. **Add unit tests**: Create `Backend/tests/test_<source>.py` mocking external HTTP calls with `responses` or `unittest.mock`.

---

## 📐 Coding Standards

### Backend (Python)

- Follow **PEP 8** style guidelines.
- Use explicit type annotations on public functions and endpoints.
- Return validated **Pydantic schemas** (`Backend/schemas.py`) from API endpoints.
- Never write hardcoded secrets or production credentials to the repository.
- Avoid external HTTP calls in request hot paths; utilize caching or background tasks.

### Frontend (React 19 + Vite)

- Use functional components with hooks.
- Follow **Apple Human Interface Guidelines (HIG)** aesthetic: clean typography, refined contrast, Apple squircle borders (`rounded-[24px]`), and smooth transitions.
- Validate styling with `npm run lint` (`oxlint`).
- Ensure no layout shift (CLS) during data fetching; use `SkeletonCard`.
- Verify dark/light mode parity on all components.

---

## 🧪 Testing & Quality Assurance

All PRs must pass CI automated testing and linting checks:

```bash
# 1. Backend Tests (Must pass with 100% success)
cd Backend
python -m pytest tests/ -v --tb=short

# 2. Frontend Linting
cd ../Frontend
npm run lint

# 3. Frontend Production Build
npm run build
```

---

## 📤 Submitting a Pull Request

1. **Fork the repo** and create your branch from `main`:
   ```bash
   git checkout -b feature/my-feature-name
   ```
2. **Commit your changes** with clear, descriptive commit messages:
   ```bash
   git commit -m "feat(api): add v1 endpoints and Pydantic response models"
   ```
3. **Push to your fork**:
   ```bash
   git push origin feature/my-feature-name
   ```
4. **Open a Pull Request** targeting `main`.
5. Describe the problem your PR solves, what was changed, and include verification steps or screenshots if modifying the UI.

---

## 🔒 Reporting Security Vulnerabilities

If you discover a security vulnerability within Hackathon Notifier, please consult our [Security Policy](.github/SECURITY.md) for disclosure instructions. **Do not create public GitHub issues for security vulnerabilities.**

---

Thank you for helping build Hackathon Notifier! 🚀
