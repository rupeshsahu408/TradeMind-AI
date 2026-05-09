# Billionaire AI — Secrets & API Keys Reference

> **Download this file for your records. Keep it private.**

---

## Database

| Key | Value |
|-----|-------|
| `DATABASE_URL` | `postgresql://neondb_owner:npg_D4xZfYeE1Aqp@ep-orange-sunset-aplgvgcp-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require` |

---

## API Keys

| Key | Source | Status |
|-----|--------|--------|
| `NVIDIA_API_KEY` | [build.nvidia.com](https://build.nvidia.com) | ✅ Set in Replit Secrets |
| `NEWS_API_KEY` | [newsapi.org](https://newsapi.org) | ✅ Set in Replit Secrets |
| `ALPHA_VANTAGE_KEY` | [alphavantage.co](https://alphavantage.co) | ✅ Set in Replit Secrets |
| `YOUTUBE_API_KEY` | [console.cloud.google.com](https://console.cloud.google.com) | ✅ Set in Replit Secrets |
| `REDDIT_CLIENT_ID` | [reddit.com/prefs/apps](https://reddit.com/prefs/apps) | ⏳ Pending approval |
| `REDDIT_CLIENT_SECRET` | [reddit.com/prefs/apps](https://reddit.com/prefs/apps) | ⏳ Pending approval |

---

## Keys to Generate Yourself

### VAPID Keys (Web Push Notifications)
Run this command once:
```bash
npx web-push generate-vapid-keys
```
Then copy the output into your `.env`:
```
VAPID_PUBLIC_KEY=<output>
VAPID_PRIVATE_KEY=<output>
```

### Session Secret
Run this command once:
```bash
openssl rand -hex 32
```
Then set it as `SESSION_SECRET=<output>` in your `.env`.

---

## Where to Set These for Deployment

### Vercel
Go to: Project → Settings → Environment Variables → Add each key

### Railway
Go to: Project → Variables → Add each key

### Render
Go to: Service → Environment → Environment Variables → Add each key

---

## .env File Setup

Rename `.env.example` to `.env` in your local clone, then fill in all the empty values using this reference file.
