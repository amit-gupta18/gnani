# Deployment Guide

Follow these steps to deploy the Audio Notes Platform. Fill in `.env` locally first to test, then mirror the same variables on Render and Vercel.

## Checklist

- [ ] Neon Postgres created, `DATABASE_URL` set, schema pushed (`npm run db:push`)
- [ ] Cloudflare R2 bucket + API credentials configured
- [ ] R2 CORS allows your Vercel domain for `PUT` and `GET`
- [ ] Upstash Redis created, `REDIS_URL` set
- [ ] Gnani API key obtained from https://gnani.ai/speech-to-text-api
- [ ] Vercel AI Gateway key created
- [ ] Render API service deployed
- [ ] Render Worker service deployed (Docker, includes ffmpeg)
- [ ] Vercel frontend deployed with `NEXT_PUBLIC_API_URL`
- [ ] `WEB_URL` on API matches Vercel domain
- [ ] `architecture.md` repo + live URL placeholders updated
- [ ] End-to-end test with 2+ min audio file

## Render — API

1. Connect GitHub repo to Render
2. Create **Web Service** (or use `render.yaml` blueprint)
3. **Build command:**
   ```
   npm install && npm run build -w @gnani/shared && npm run build -w @gnani/db && npm run build -w @gnani/queue && npm run build -w @gnani/api
   ```
4. **Start command:** `node apps/api/dist/index.js`
5. Set environment variables from `.env.example`

## Render — Worker

1. Create **Background Worker** with Docker
2. **Dockerfile path:** `apps/worker/Dockerfile`
3. **Docker context:** `.` (repo root)
4. Set same env vars as API, plus:
   - `GNANI_API_KEY`
   - `AI_GATEWAY_API_KEY`
   - `AI_GATEWAY_MODEL`
   - `AI_GATEWAY_FALLBACK_MODELS`

## Vercel — Frontend

1. Import repo, set **Root Directory** to repo root (uses root `vercel.json`)
2. Environment variable:
   - `NEXT_PUBLIC_API_URL` = `https://your-api.onrender.com`
3. Deploy

## R2 CORS (required for browser upload)

In Cloudflare R2 bucket settings → CORS:

```json
[
  {
    "AllowedOrigins": ["https://your-app.vercel.app", "http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## Post-deploy smoke test

1. Upload a 2–3 minute MP3
2. Watch status: Uploaded → Transcribing → Summarizing → Done
3. Confirm transcript and structured summary render
4. Refresh page — note should persist
5. Open `/architecture` — should show full doc

## Update architecture.md

Replace remaining placeholders before submission:

```
**Repo:** https://github.com/<you>/<repo>
**Live app:** https://your-app.vercel.app
```

Then re-copy to `apps/web/content/architecture.md` and redeploy Vercel.
