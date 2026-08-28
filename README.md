# Audio Notes Platform

Upload audio, get a Gnani ASR transcript and an LLM-generated structured summary. Built for the Gnani.ai take-home assignment.

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 (Vercel) |
| API | Express + TypeScript (Render) |
| Worker | Node + BullMQ (Render, Docker + ffmpeg) |
| Database | Neon Postgres |
| Queue | Upstash Redis + BullMQ |
| Storage | Cloudflare R2 (presigned direct upload) |
| ASR | Gnani STT REST (`en-IN`) |
| LLM | Vercel AI Gateway |

## Monorepo structure

```
apps/web      → Next.js frontend
apps/api      → Express REST API
apps/worker   → Background job processor
packages/db   → Drizzle ORM + queries
packages/queue → BullMQ queue helpers
packages/shared → Types, Zod schemas, constants
```

## Local development

### Prerequisites

- Node.js 20+
- ffmpeg + ffprobe on PATH (required for worker)
- Postgres, Redis, R2, Gnani API key, AI Gateway key

### Setup

1. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
   Fill in all values in `.env`.

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run database migration:
   ```bash
   npm run db:push
   ```

4. Build packages:
   ```bash
   npm run build -w @gnani/shared
   npm run build -w @gnani/db
   npm run build -w @gnani/queue
   ```

5. Start services (three terminals):
   ```bash
   npm run dev:api
   npm run dev:worker
   npm run dev:web
   ```

6. Open http://localhost:3000

## Deployment

### 1. Neon Postgres

Create a project, copy `DATABASE_URL`, run `npm run db:push` against it.

### 2. Cloudflare R2

- Create a bucket
- Create API token with Object Read & Write
- Configure CORS for your Vercel domain:
  ```json
  [
    {
      "AllowedOrigins": ["https://your-app.vercel.app"],
      "AllowedMethods": ["GET", "PUT"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }
  ]
  ```

### 3. Upstash Redis

Create a Redis database, copy `REDIS_URL`.

### 4. Render (API + Worker)

Use the included [`render.yaml`](render.yaml) blueprint or create two services:

**API (Web Service)**
- Build: `npm install && npm run build -w @gnani/shared && npm run build -w @gnani/db && npm run build -w @gnani/queue && npm run build -w @gnani/api`
- Start: `node apps/api/dist/index.js`
- Set all env vars from `.env.example`

**Worker (Background Worker)**
- Use Docker: `apps/worker/Dockerfile`
- Same env vars as API plus `GNANI_API_KEY` and `AI_GATEWAY_API_KEY`

### 5. Vercel (Frontend)

- Root directory: `apps/web`
- Set `NEXT_PUBLIC_API_URL` to your Render API URL
- Deploy

### 6. Cross-origin cookies

Set `WEB_URL` on the API to your Vercel URL. Cookies use `SameSite=None; Secure` in production.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/uploads/presign` | Get presigned R2 PUT URL |
| POST | `/notes` | Register upload, enqueue transcription |
| GET | `/notes` | List session notes |
| GET | `/notes/:id` | Get note with status/progress |
| POST | `/notes/:id/retry` | Retry failed note |

## Environment variables

See [`.env.example`](.env.example) for the full list.

## Architecture

See [architecture.md](architecture.md) or the live `/architecture` page after deploy.
