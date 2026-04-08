# Roof Tool — Setup Guide

## Prerequisites
- Node.js 18+
- Docker (for NodeODM)

---

## 1. Install dependencies
```bash
npm install
```

---

## 2. Configure environment variables
```bash
cp .env.example .env.local
```
Then fill in your values (see each section below).

---

## 3. Google Drive access

**Create credentials:**
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → APIs & Services → Enable **Google Drive API**
3. Create OAuth 2.0 credentials → Desktop App
4. Download the client JSON, copy the Client ID and Secret into `.env.local`

**Get your refresh token (one-time):**
```bash
node scripts/google-auth.js
```
Follow the prompts and paste the `GOOGLE_REFRESH_TOKEN` into `.env.local`.

> The app uses **read-only** Drive access. It only looks inside folders that
> match client names — it never modifies your Drive.

---

## 4. NodeODM (photogrammetry engine)

Run locally with Docker:
```bash
docker run -p 3001:3000 opendronemap/nodeodm
```

Set in `.env.local`:
```
ODM_HOST=http://localhost:3001
```

Or use [WebODM Lightning](https://webodm.net) cloud and set the host + token accordingly.

---

## 5. Initialise the database
The SQLite database is created automatically on first run. Default location: `./data/roof-tool.db`

---

## 6. Run the app
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

---

## Drone photo naming convention
The app automatically detects photo angles from filenames. Name your drone photos:
- `aerial.jpg` — overhead shot
- `north.jpg` — north-facing angle
- `south.jpg` — south-facing angle
- `east.jpg` — east-facing angle
- `west.jpg` — west-facing angle

Photos without matching names are labelled "other" but still processed.

---

## Quote pricing (configurable in Settings)
| Service | Default Rate |
|---------|-------------|
| Full Reroof | $10.00 / sq ft |
| Roof Spray | $1.00 / sq ft |
| Roof Tune-Up | $0.15 / sq ft |
| Gutter Clean | $0.40 / lin ft |

Pitch multipliers and tax rate are also configurable in the Settings page.
