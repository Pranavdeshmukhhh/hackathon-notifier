# 🛡️ Security Policy — Hackathon Notifier

Welcome to the **Hackathon Notifier** security policy. We take the safety and integrity of this project, our services, and community data seriously.

If you believe you have discovered a security vulnerability, we appreciate your help in disclosing it to us responsibly.

---

## ⚡ Quick Reference

| Item | Details |
| :--- | :--- |
| **Primary Reporting Channel** | [GitHub Private Vulnerability Reporting](https://github.com/Pranavdeshmukhhh/hackathon-notifier/security/advisories/new) |
| **Initial Acknowledgment** | Within **48 hours** |
| **Triage & Assessment** | Within **3–5 business days** |
| **Supported Branches** | `main` branch (latest commit) |
| **Live Deployments** | [hackathon-notifier.vercel.app](https://hackathon-notifier.vercel.app) & [hackathon-notifier.onrender.com](https://hackathon-notifier.onrender.com) |
| **Public Issues for Security?** | ❌ **No.** Please do not open public issues for security vulnerabilities. |

---

## 📦 Supported Versions

We actively provide security patches and updates for the following components:

| Component | Target / Environment | Status |
| :--- | :--- | :---: |
| **`main` branch** | Latest repository source code | ✅ Supported |
| **Frontend Web App** | [hackathon-notifier.vercel.app](https://hackathon-notifier.vercel.app) (Vercel) | ✅ Supported |
| **Backend API** | [hackathon-notifier.onrender.com](https://hackathon-notifier.onrender.com) (Render) | ✅ Supported |
| **Forked / Outdated branches** | Any detached commit or unmerged fork | ❌ Not Supported |

---

## 🚨 How to Report a Vulnerability

> [!IMPORTANT]
> **Please DO NOT report security vulnerabilities via public GitHub issues, pull requests, discussions, or social media.**  
> Disclosing an unpatched vulnerability publicly puts users and live deployments at risk.

### Method 1: GitHub Private Vulnerability Reporting (Recommended)

GitHub provides a built-in, confidential channel to report security issues directly to repository maintainers:

1. Go to the repository's **[Security Tab](https://github.com/Pranavdeshmukhhh/hackathon-notifier/security)**.
2. Select **Advisories** on the left sidebar.
3. Click the green **[Report a vulnerability](https://github.com/Pranavdeshmukhhh/hackathon-notifier/security/advisories/new)** button.
4. Fill out the advisory form with details and submit. This creates an encrypted, private discussion accessible only to you and the project maintainers.

### Method 2: Direct Maintainer Contact

If you cannot access the GitHub Advisories interface:
- Reach out privately via GitHub profile: [@Pranavdeshmukhhh](https://github.com/Pranavdeshmukhhh).

---

## 📝 What to Include in Your Report

To help us investigate, triage, and resolve the issue quickly, please include:

1. **Summary**: A clear, concise overview of what the vulnerability is.
2. **Impact**: What could an attacker potentially do? (e.g., bypass rate limits, access internal endpoints, inject malicious code).
3. **Affected Component**:
   - Frontend (`Frontend/` or https://hackathon-notifier.vercel.app)
   - Backend API (`Backend/` or https://hackathon-notifier.onrender.com)
   - Scrapers (`Backend/scrapers/`)
   - CI/CD & Deployments (`.github/workflows/`, `vercel.json`)
4. **Steps to Reproduce**: Step-by-step instructions, a cURL command, or minimal code snippet showing how to trigger the issue.
5. **Suggested Fix**: (Optional) If you have identified how to fix or mitigate the issue, let us know!

---

## ⏱️ What to Expect After Reporting

We follow a **Coordinated Vulnerability Disclosure** workflow:

```mermaid
flowchart LR
    A[📩 Report Submitted] --> B[⏱️ Acknowledgment\n< 48 hours]
    B --> C[🔍 Triage & Validation\n3-5 business days]
    C --> D[🛠️ Fix Developed\nin private branch]
    D --> E[🚀 Deployed to\nVercel & Render]
    E --> F[📢 Public Advisory\n& Reporter Credit]
```

1. **Prompt Acknowledgment**: You will receive a response within **48 hours** confirming that we received your report.
2. **Active Investigation**: We reproduce the issue and evaluate the severity within **3–5 business days**.
3. **Private Remediation**: We write and verify a patch in a private security branch without leaking details.
4. **Immediate Deployment**: The fix is deployed straight to production on Vercel and Render.
5. **Credit & Recognition**: After the patch is live, we publish a security advisory and credit you for your responsible disclosure (unless you prefer to remain anonymous).

---

## 🛡️ Built-in Security Measures

Here is a plain-English explanation of how Hackathon Notifier protects users and services:

### 1. Zero Leaked Credentials
- **No secrets in git**: API keys, database connection strings (`MONGO_URI`), and Telegram bot tokens are strictly loaded via `.env`.
- Files containing credentials (`.env`, `.env.local`, `.pem`) are blocked by `.gitignore`.
- Production secrets are stored securely in Vercel and Render encrypted environment stores.

### 2. Frontend Hardening (`Frontend/vercel.json`)
- **Content Security Policy (CSP)**: Restricts scripts, styles, fonts, and API requests exclusively to self and trusted origins (`https://fonts.googleapis.com`, `https://fonts.gstatic.com`, Render API). Blocks unauthorized object embeds (`object-src 'none'`) and framing (`frame-ancestors 'none'`).
- **Clickjacking Protection (`X-Frame-Options: DENY`)**: Prevents external sites from embedding the application inside hidden iframes.
- **MIME Sniffing Block (`X-Content-Type-Options: nosniff`)**: Forces browsers to strictly adhere to declared content types.
- **XSS Protection (`X-XSS-Protection: 1; mode=block`)**: Enables browser-level cross-site scripting filtering and blocking.
- **HSTS (Strict-Transport-Security)**: Enforces TLS encryption with a 2-year duration (`max-age=63072000; includeSubDomains; preload`).
- **Permissions Policy**: Completely turns off unnecessary browser hardware access (`camera=()`, `microphone=()`, `payment=()`, `usb=()`).
- **Cross-Domain Restrictions (`X-Permitted-Cross-Domain-Policies: none`)**: Prevents cross-domain data policy leaks.

### 3. Backend & API Defense (`Backend/api.py`)
- **OWASP Security Response Headers**: Automatically injected on every API response (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `X-XSS-Protection`, `Permissions-Policy`, `X-Permitted-Cross-Domain-Policies`).
- **Per-IP Rate Limiting**: SlowAPI restricts incoming requests (60 req/min for hackathons, health, and metrics; 5 req/min for cache clear) to safeguard the server from spam and abusive traffic.
- **Client IP Verification**: Proxy and Cloudflare headers (`CF-Connecting-IP`, `X-Forwarded-For`) are validated against IPv4/IPv6 syntax with Python's `ipaddress` module before trusting for rate limiting.
- **Constant-Time Admin Authentication**: Admin actions require an `ADMIN_SECRET` checked via `secrets.compare_digest` to prevent side-channel timing attacks.
- **Strict Query & Payload Validation**: All API inputs enforce boundary constraints (`page` 1–1000, `limit` 1–100, `lat`/`lng` geographical limits, string length caps on search/category) to reject malformed requests before database query execution.
- **Database Error Sanitization**: `/health` verifies database connectivity with a live ping, but swallows error details into a generic JSON status to prevent exposing database strings, credentials, or internal stack traces.
- **Production Documentation Shielding**: Swagger and ReDoc documentation (`/docs`, `/redoc`) can be dynamically disabled in production via `ENVIRONMENT=production`.
- **Database Unique Indexing**: MongoDB enforces unique indices on `link` to guarantee duplicate elimination even under concurrent race conditions.
- **Polite Scraping**: Web scrapers incorporate randomized delays, modern TLS fingerprints (`curl_cffi`), and backoff logic to prevent overwhelming upstream platforms.

### 4. User Privacy & Telemetry
- **No User Accounts Required**: Zero passwords, sessions, or personal user profiles are stored in the database.
- **Zero Third-Party Trackers**: Completely free of Google Analytics, tracking pixels, or marketing cookies.
- **Minimal Telegram Data**: Telegram subscribers are stored solely as chat IDs associated with opt-in notification settings.
- **Private Geolocation**: Location queries for "Nearest Hackathons" occur client-side for distance calculation — user coordinates are never persisted to a database.
- **Server-Side Anonymized Telemetry**: Basic visitor metrics (anonymized IP, country, device type) are processed server-side with strict in-memory debouncing (max 1 alert per IP every 6 hours; max 1 globally every 15s) purely for uptime monitoring and admin traffic notifications.

---

## 🔒 Best Practices for Contributors & Self-Hosters

If you run or contribute to this codebase locally:

- 🛑 **Never push `.env` files** to GitHub. Always use `.env.example` as a clean template.
- 🔄 **Rotate exposed keys immediately**: If you accidentally expose a Telegram token or MongoDB connection URI, revoke and regenerate it immediately.
- 🛡️ **Restrict MongoDB Atlas Network Access**: Limit database access to specific IP ranges or your Render outbound IPs instead of leaving `0.0.0.0/0` open permanently.
- 📦 **Keep dependencies clean**: Regularly run `npm audit` in `Frontend/` and update packages in `Backend/requirements.txt`.

---

<div align="center">
  <sub>Maintained by <strong><a href="https://github.com/Pranavdeshmukhhh">Pranav Deshmukh</a></strong></sub><br>
  <sub>Thank you for helping keep Hackathon Notifier safe for everyone!</sub>
</div>
