# Roof Tool MVP Deployment Plan

## Overview
Turn the Roof Tool app into a live web app that friends can access in their browsers. MVP scope: new job form → satellite estimate → roof report PDF + optional service quote.

**Stack:** Next.js 15 (already built) + SQLite + Python (reportlab) on Railway.app or Render.com

---

## Phase 1: Strip & Simplify
*Goal: Remove everything not needed for MVP so the app is clean and deployable.*

### 1.1 — Remove Non-MVP Pages & Features
**Status:** PENDING

**Delete/Remove:**
- `app/settings/page.tsx` and `/api/settings/*` routes
- All Google Drive integration (`lib/drive.ts`, drive buttons in forms, drive folder naming)
- All ODM/drone upload code (`lib/odm.ts`, `app/jobs/[id]/process`, job image upload UI)
- The drone image processing pipeline

**Keep:**
- Satellite estimate pipeline (already auto-runs on job creation)
- Measurement calculations
- Quote generation

**Files to modify:**
- `app/jobs/new/page.tsx` — remove "Find in Drive" button
- `app/jobs/[id]/page.tsx` — remove drone processing section, keep only: satellite status display, measurements table, "Generate Report" button, "Get Quote" button
- Delete `app/settings` directory entirely

---

### 1.2 — Simplify New Job Form
**Status:** PENDING

**Keep form fields:**
- Client Name (required)
- Address (required, with geocode verification)
- Phone (optional)
- Email (optional)
- Notes/Special Instructions (textarea, optional)

**Remove:**
- "Find in Drive" button and flow
- Drive folder selection
- All Drive integration logic

**Form should:**
- Submit → geocode address → auto-run satellite estimate → redirect to job detail page
- Show loading state while satellite estimate runs
- Display error if address can't be geocoded

---

### 1.3 — Replace Dashboard with Public Landing Page
**Status:** PENDING

**New `app/page.tsx` (public landing page):**
- Clean hero section: "Free Roof Estimates Powered by Satellite"
- Single CTA button: "Get Your Free Estimate"
- Links to: New Job → Login (if not already logged in)
- Simple footer with company info

**Move jobs list to `/admin` route:**
- `GET /admin` → list all jobs (password protected)
- Useful for you to review what people generated

---

### 1.4 — Strip Job Detail Page
**Status:** PENDING

**Keep on `GET /jobs/[id]`:**
- Client info display (name, address, contact)
- Satellite estimate status (loading / success / error)
- Measurement table (area, pitch, perimeter, facet count)
- "Generate Report" button → opens PDF
- "Get Quote" button → shows quote builder (Phase 3)

**Remove:**
- Drone image upload section
- ODM task monitoring
- Processing status / error logs
- Measurement edit form (no manual entry for MVP)

---

## Phase 2: Authentication
*Goal: Light password gate so random internet people can't spam the app.*

### 2.1 — Single-Password Middleware Auth
**Status:** PENDING

**Add `middleware.ts`:**
- Intercept all requests (except `/login` and `/api/login`)
- Check for `auth-token` cookie
- If missing or invalid → redirect to `/login`
- Login endpoint accepts a single hardcoded password from `.env` variable
- On valid password → set secure httpOnly cookie, redirect to `/`

**Benefits:**
- No database user table needed
- Simple to implement (~50 lines of code)
- Easy to share with friends (just give them the password)
- Can rotate password by changing `.env`

### 2.2 — Build Login Page
**Status:** PENDING

**`GET /login`:**
- Simple form: single password input
- Submit → POST `/api/login`
- On success → set cookie + redirect to home
- On failure → show error, stay on login page
- Show logout button in navbar (destroys cookie)

**Styling:** Match existing futuristic brand (light blue, hexagons)

---

## Phase 3: Quote Builder UI
*Goal: After satellite estimate, let users select services and generate a quote PDF.*

### 3.1 — Add Inline Quote Service Selector
**Status:** PENDING

**On job detail page, after measurements display:**
- Section: "Select Services for Quote"
- Checkboxes for each service:
  - [ ] Full Reroof
  - [ ] Spray Coating / Roof Coating
  - [ ] Roof Tune-Up
  - [ ] Gutter Clean
- For each service: show $ price per sqft (pulled from env vars)
- Display live total price: `roof_area_sqft * price_per_sqft`
- "Generate Quote" button → POST to `/api/jobs/[id]/quotes` → download PDF

**Pricing from env vars:**
```
PRICING_REROOF_PSQFT=12.50
PRICING_SPRAY_PSQFT=3.25
PRICING_TUNEUP_PSQFT=2.00
PRICING_GUTTER_PSQFT=0.50
TAX_RATE=0.08
```

### 3.2 — Wire Up Quote Generation End-to-End
**Status:** PENDING

**Existing code already handles this; just wire the UI:**
- Quote selector saves selected services + pricing to DB
- `/api/jobs/[id]/quotes` creates quote record
- `/api/jobs/[id]/report` generates multi-page PDF (page 3 is quote, if exists)
- Verify the full end-to-end flow works: select services → generate report → PDF has all 3 pages

---

## Phase 4: Deployment & Configuration
*Goal: Move config to env vars, containerize, and deploy to Railway.*

### 4.1 — Move All Config to .env
**Status:** PENDING

**Remove `app/settings` route and hardcode company info via env vars:**
```
COMPANY_NAME=Roof Tool
COMPANY_TAGLINE=Drone-Powered Roofing Assessments
COMPANY_PHONE=250-555-1234
COMPANY_EMAIL=info@rooftool.ca
COMPANY_ADDRESS=Kelowna, BC

PRICING_REROOF_PSQFT=12.50
PRICING_SPRAY_PSQFT=3.25
PRICING_TUNEUP_PSQFT=2.00
PRICING_GUTTER_PSQFT=0.50
TAX_RATE=0.08

APP_PASSWORD=your-secure-password-here
DATABASE_PATH=/data/roof-tool.db
```

**Update code to read from `process.env` instead of DB settings table.**

---

### 4.2 — Write Dockerfile
**Status:** PENDING

**Create `/Dockerfile`:**
```dockerfile
FROM node:20-alpine

# Install Python and required Python packages
RUN apk add --no-cache python3 py3-pip
RUN pip3 install reportlab Pillow requests

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

**Why this works:**
- Alpine is tiny (~150MB base)
- Includes Python 3 + pip
- Installs reportlab/Pillow/requests before running the app
- Runs the Next.js production build

---

### 4.3 — Create Persistent Volume Config
**Status:** PENDING

**On Railway/Render:**
- Add a volume mounted at `/data`
- Update `.env`: `DATABASE_PATH=/data/roof-tool.db`
- SQLite file persists between deploys
- Backups: Railway auto-backs up volumes; check their dashboard

---

### 4.4 — Deploy to Railway
**Status:** PENDING

**Setup steps:**
1. Create GitHub repo (or use existing if public)
2. Sign up at Railway.app (free tier available)
3. Connect GitHub account → import repo
4. Railway auto-detects Node.js, reads Dockerfile
5. Set environment variables in Railway dashboard (copy `.env` values)
6. Add volume: create `data` mount at `/data`
7. Deploy → Railway builds Docker image, starts container
8. Get public URL (e.g., `roof-tool-prod.up.railway.app`)
9. Share with friends: `https://roof-tool-prod.up.railway.app`

**One-time setup:** ~15 minutes. Updates: just push to GitHub, Railway auto-redeploys.

---

## Project Structure After MVP Changes

```
Roof Tool/
├── app/
│   ├── page.tsx                  (landing page — NEW)
│   ├── login/
│   │   └── page.tsx              (login page — NEW)
│   ├── admin/
│   │   └── page.tsx              (jobs list — MOVED from /)
│   ├── jobs/
│   │   ├── new/
│   │   │   └── page.tsx          (simplified)
│   │   ├── [id]/
│   │   │   ├── page.tsx          (stripped down)
│   │   │   ├── quote/
│   │   │   │   └── page.tsx      (kept, now simpler)
│   │   │   └── report/
│   │   │       └── route.ts      (kept as-is)
│   │   └── route.ts              (API — updated to not hit drive)
│   ├── api/
│   │   ├── login/
│   │   │   └── route.ts          (NEW — password validation)
│   │   ├── jobs/
│   │   │   ├── route.ts          (updated)
│   │   │   └── [id]/
│   │   │       ├── quotes/
│   │   │       │   └── route.ts  (kept as-is)
│   │   │       └── report/
│   │   │           └── route.ts  (kept as-is)
│   │   └── geocode/
│   │       └── route.ts          (kept as-is)
│   ├── globals.css               (kept)
│   └── layout.tsx                (updated navbar: add logout)
├── middleware.ts                 (NEW — auth checks)
├── lib/
│   ├── db.ts                     (kept as-is)
│   ├── satellite.ts              (kept as-is)
│   ├── satellite-save.ts         (kept as-is)
│   └── [delete drive.ts, odm.ts] (REMOVED)
├── components/
│   ├── RoofTracer.tsx            (kept as-is)
│   └── StatusBadge.tsx           (kept as-is)
├── scripts/
│   ├── generate-report.py        (kept as-is)
│   └── init-db.ts                (kept as-is)
├── public/                       (kept)
├── Dockerfile                    (NEW)
├── .env.example                  (NEW — template for Railway)
├── .env.local                    (LOCAL ONLY — don't commit)
├── package.json                  (no changes to deps)
├── next.config.ts                (kept)
├── tsconfig.json                 (kept)
├── tailwind.config.ts            (kept)
├── MVP_DEPLOYMENT_PLAN.md        (this file)
└── CLAUDE.md                     (update with MVP scope notes)
```

---

## Build Order (Recommended)

1. **Phase 1.1 + 1.2 + 1.3 + 1.4** — Strip the app down (1–2 sessions with Sonnet)
2. **Phase 2** — Add simple password auth (1 session with Sonnet)
3. **Phase 3** — Wire up quote UI (1 session with Sonnet)
4. **Phase 4** — Config + Docker + Railway deploy (1 session with Sonnet; use Opus only if deployment breaks)

**Total:** ~4–5 sessions with Sonnet. If you hit a tricky issue (Python on Railway, SQLite persistence, etc.), one Opus session to debug.

---

## Token Efficiency Notes

- **Sonnet:** Handles all UI changes, form simplification, config migration, Dockerfile, auth middleware
- **Opus:** Reserve for algorithmic or deployment issues that Sonnet can't resolve
- **Why:** Phases 1–4 are mostly mechanical changes (deletion, form fields, env var migration). Sonnet is fast and cheap for this.

---

## Success Criteria

✅ App runs locally without settings page, drive integration, or ODM code  
✅ Landing page is public; everything else requires password  
✅ New job form → auto-satellite → report PDF in <2 min  
✅ Quote selector works end-to-end (select services → PDF with quote)  
✅ Deployed to Railway, accessible at public URL  
✅ Friend can visit URL, log in with password, generate a report  

---

## Next Steps When Ready

1. Copy the `/sessions/practical-compassionate-dirac/mnt/Roof Tool` folder to a new `Roof Tool MVP` folder (safe backup of full-featured version)
2. Work on MVP in the new folder
3. Start Phase 1.1 with Sonnet in Claude Code
4. Follow the build order above

---

*Generated: 2026-04-07*
*Plan by Claude — ready to review and approve before build begins*
