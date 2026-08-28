# Audio Notes Platform — Research & System Design

Take-home for Gnani.ai Full-Stack/AI Engineer internship. Deadline: 28 Aug 2026, 23:59 IST.

> This is a research/design document only — nothing here is implemented yet.

---

## 1. The Assignment (recap)

Build an Audio Notes Platform:
- User uploads audio (2+ min) → transcript via Gnani ASR API → LLM-generated summary.
- Past uploads listed and reopenable.
- Deployed, usable via URL, no setup.
- `/architecture` page: upload-to-transcript flow, file storage, long-audio handling, sync vs background, what you'd improve, GitHub link.
- Visible failure handling (upload errors, API timeouts, corrupt files).
- Visible upload/processing progress.

Stack/DB/hosting/UI are open choice.

---

## 2. What a Reviewer Is Actually Testing

Anyone can wire "upload → API call → show result." The requirements explicitly call out **long-audio handling** and **sync vs background** — that's the tell. The differentiator is not UI polish or stack choice; it's:

1. **Real background/async job handling** — not a blocking request, not a fake `setTimeout`.
2. **Failure handling that's actually exercised** — corrupt file, timeout, bad API response all degrade visibly and gracefully, not just theoretical try/catch.
3. **An architecture writeup that shows engineering judgment** — explicit tradeoffs made under time pressure, and a credible "what I'd improve" section.
4. Secondary (AI-engineer signal): a *good* summarization prompt (structured — key points/action items) rather than a generic paragraph.

---

## 3. Database Choice: Postgres (Neon) vs MongoDB

The data is relational and state-machine-shaped, not document-shaped:

- Fixed schema: `id, filename, status, transcript, summary, timestamps`.
- Strict status transitions: `uploaded → transcribing → summarizing → done|failed`.
- Frequent filtered queries: "find all `uploaded` rows," "find all `failed` rows."

**Why Postgres wins here:**
- **Enums/constraints** enforce the state machine at the DB level (Mongo would silently accept a typo'd status string).
- **Row-level locking** (`SELECT ... FOR UPDATE SKIP LOCKED`) gives safe concurrent job-claiming — native to Postgres, hand-rolled in Mongo.
- Mongo's core advantage — flexible/nested schema — isn't needed here. Where flexibility *is* useful (e.g. storing the raw ASR JSON response), Postgres's `jsonb` column covers it without giving up transactional guarantees.

**When Mongo would actually make sense:** highly variable/nested documents queried into directly (e.g. speaker-diarized segment trees as first-class query targets). Not this app.

**Verdict:** Postgres/Neon is the correct choice, not a compromise. Worth one line in `/architecture` — signals judgment.

**Neon specifically:** serverless Postgres, branching, generous free tier — no downside vs. vanilla Postgres for this use case.

---

## 4. Storage Choice: Cloudflare R2

- S3-compatible API → use `@aws-sdk/client-s3` as-is.
- No egress fees (unlike S3) — relevant if transcript re-fetch/replay happens often.
- Use **presigned PUT URLs** so the browser uploads the audio file *directly* to R2, bypassing the app server entirely.
  - Avoids routing large files through a Node/Express request (memory, timeout, bandwidth cost).
  - Enables real upload progress via `XMLHttpRequest.upload.onprogress` against the direct PUT.

---

## 5. Backend Choice: Express + TypeScript (not Next.js API routes)

Decision: **Express+TS backend, decoupled from the frontend**, rather than Next.js API routes.

Rationale:
- Next.js API routes on Vercel are serverless functions — short execution limits, no persistent process. That forces workarounds (cron-polling) to fake background work.
- An Express server is a **persistent process**, which is a prerequisite for running a real queue worker (BullMQ) continuously, not just on a cron tick.
- Decoupling frontend (Vercel-hosted, static/SSR) from backend (Render/Railway-hosted, persistent) mirrors real production topology and scales each independently.

---

## 6. Why a Real Queue Is Needed (BullMQ + Redis)

Design goal: build for scale, not for "one user at a time."

With a persistent Express backend, cron-polling is no longer the only option — a **BullMQ (Redis-backed) queue** is the correct mechanism:

- Upload request enqueues a job, returns immediately (~ms), doesn't wait on ASR/LLM.
- A **separate worker process** consumes jobs — decoupled from HTTP request lifecycle.
- BullMQ gives, out of the box: retries with backoff, concurrency limits, dead-letter/failed-job inspection, job-ID based idempotency.
- Horizontally scalable: add worker instances to increase throughput without touching the API layer.
- **Redis provider**: Upstash (serverless Redis, free tier, reachable from any host).

**Two-stage queue** rather than one monolithic job:
`transcribe-queue` → `summarize-queue`
— so a summary failure doesn't force re-running (and re-paying for) ASR.

**Idempotency:** use the note's `id` as the BullMQ job ID, so an accidental double-enqueue (e.g. client retry) doesn't duplicate processing.

**Concurrency control:** BullMQ `concurrency` setting tuned to Gnani API's rate limits — central throughput control instead of uncontrolled fan-out.

---

## 7. Data Model (Postgres, Neon)

```
notes
  id              uuid PK
  filename        text
  r2_key          text
  status          enum(uploaded, transcribing, summarizing, done, failed)
  error_message   text nullable
  transcript      text nullable
  summary         text nullable
  duration_seconds int nullable
  created_at      timestamp
  updated_at      timestamp
```

Postgres row = durable source of truth. Redis/BullMQ = execution mechanism only. Frontend never talks to Redis directly — only polls the DB-backed API.

---

## 8. End-to-End Flow

1. **Upload (sync)**
   - Client → `POST /uploads/presign` (server validates content-type/size before issuing) → gets presigned R2 PUT URL.
   - Client PUTs file directly to R2, tracking progress.
   - Client → `POST /notes` with `{filename, r2_key, duration}` → row inserted, `status=uploaded`, job enqueued → `noteId` returned, redirect to `/notes/:id`.
   - Reject non-audio mime types / empty files both client- and server-side.

2. **Background processing (async)**
   - Worker claims job → `status=transcribing` → calls Gnani ASR (timeout + BullMQ retry/backoff) → on success stores `transcript`, `status=summarizing`.
   - Worker calls Claude for structured summary → stores `summary`, `status=done`.
   - Any stage exception → `status=failed`, `error_message` set from the real underlying error (ASR timeout / corrupt file / API error), job left in BullMQ's failed-job set for inspection.
   - `POST /notes/:id/retry` re-enqueues a failed note.

3. **Frontend**
   - Polls `GET /notes/:id` every 2-3s while non-terminal; renders step tracker (Uploaded → Transcribing → Summarizing → Done) or error + Retry button.
   - `/notes` lists all past notes (filename, status badge, created_at) → click to reopen.
   - `/architecture` — static page per requirements, with GitHub link.

---

## 9. System Diagram — Current Design (Express + BullMQ)

```
┌──────────┐   presigned PUT    ┌─────┐
│ Frontend │───────────────────▶│ R2  │
│ (Vercel) │◀───────────────────│     │
└────┬─────┘   progress %       └─────┘
     │
     │ REST (CORS)
     ▼
┌─────────────────┐        enqueue        ┌────────────────┐
│ Express API (TS)│──────────────────────▶│ Redis (Upstash) │
│  Render/Railway  │                       │  BullMQ queue   │
└────────┬─────────┘                       └───────┬─────────┘
         │ write row                                │ consume
         ▼                                          ▼
   ┌───────────┐                          ┌──────────────────┐
   │ Neon (PG) │◀─────update status───────│ Worker process(es)│
   │  notes    │                          │  Render/Railway    │
   └───────────┘                          └────────┬──────────┘
         ▲                                          │
         │ poll GET /notes/:id                      ▼
         │                                  Gnani ASR → Claude LLM
   Frontend polls
```

### Job pipeline detail

```
[uploaded] --worker claims (job id = note.id)--> [transcribing]
     |                                                  |
     |                                          Gnani ASR call
     |                                          (timeout + retry/backoff)
     |                                                  |
     |                                     success ─────┼───── failure
     |                                        |                   |
     |                                        v                   v
     |                                 [summarizing]         [failed] + error_message
     |                                        |                   ^
     |                                Claude summary call         |
     |                                (timeout + retry)           |
     |                                        |                   |
     |                              success ──┼── failure ────────┘
     |                                 |
     |                                 v
     |                              [done]
     |
     +--> POST /notes/:id/retry re-enqueues from [failed] -> [uploaded]
```

---

## 10. Failure Handling Matrix

| Failure point            | Detection                          | User-visible result                                  |
|---------------------------|-------------------------------------|-------------------------------------------------------|
| Bad file type / empty file| Client + server validation          | Inline error before upload starts                     |
| Upload interrupted        | R2 PUT error / progress stalls      | Error banner, "retry upload" prompt                    |
| Gnani ASR timeout         | AbortController timeout in worker   | `status=failed`, error_message="ASR timed out", Retry  |
| Gnani ASR error (corrupt) | Non-2xx / error response from Gnani | `status=failed`, error_message = Gnani's message       |
| LLM summary failure       | try/catch around Claude call        | `status=failed` but transcript preserved; Retry re-runs only summarization |
| Worker crash mid-job      | BullMQ job left unacked             | BullMQ re-delivers job after visibility timeout        |
| Duplicate enqueue         | Same note.id used as job ID         | BullMQ dedupes, no double-processing                   |

---

## 11. `/architecture` Page — Content Outline

1. Diagram: Upload → R2 → Postgres row → BullMQ queue → Worker → Gnani ASR → Claude LLM → Postgres update → Frontend poll.
2. File storage: direct-to-R2 presigned upload, why (bypasses server for large files).
3. Long-audio handling: why async (ASR duration unbounded, can't hold an HTTP request open); two-stage queue so partial progress isn't lost.
4. Sync vs background: upload + metadata write = sync; ASR + summarization = background job.
5. Failure handling: table above, condensed.
6. What I'd improve: see Section 12 below.
7. GitHub repo link.

---

## 12. Scale-Up Roadmap ("What I'd Improve")

This is the strongest signal of engineering maturity for a reviewer — showing the ceiling of the current design and the correct next step, even if unimplemented.

1. **BullMQ/Redis → SQS or Kafka**
   Redis is memory-resident; without careful persistence config, in-flight jobs can be lost on a crash. At real scale: **SQS** (durable, dead-letter queues built in) or **Kafka** if multiple independent consumers need the same event stream (e.g. analytics consuming "note transcribed" separately from the summarizer).

2. **Polling → WebSockets / SSE / push**
   Per-client polling doesn't scale with user count. Replace with **Server-Sent Events** or a WebSocket channel per note, or a push notification (email/in-app) on completion — client doesn't need an open tab polling.

3. **Fixed worker → autoscaled worker pool**
   Run workers as a **Kubernetes Deployment with HPA** keyed on queue depth, or platform-native autoscaling (Render/Railway autoscale, or AWS Fargate/Lambda triggered by SQS depth) — worker count tracks upload volume.

4. **Rate-limiting / backpressure / circuit breaker on Gnani calls**
   A token-bucket limiter (or BullMQ's built-in rate limiter) in front of outbound ASR calls prevents throttling/bans under load; a circuit breaker prevents retry storms during a Gnani outage.

5. **Caching / read replicas**
   Completed notes are immutable and read-heavy (reopening history). Add a cache (Redis or CDN edge) in front of `GET /notes/:id` for `done` notes; a Neon read replica for list/history views keeps the write path (job status updates) uncontended.

6. **Resumable/chunked uploads**
   Move from single presigned PUT to R2's S3-compatible multipart upload for large files / flaky connections — also enables real per-chunk progress instead of an approximate bar.

7. **Auth + multi-tenancy**
   Add real auth (JWT/session) + `user_id` FK + row-level access control. Explicitly out of scope for the take-home — name it so it reads as a deliberate cut, not an oversight.

8. **Observability**
   Structured logging + tracing (OpenTelemetry) + metrics (queue depth, per-stage job duration, failure rate) shipped to Grafana/Datadog — needed to distinguish systemic ASR slowness from one-off failures at volume.

---

## 13. Build Order (fits ~24h timeline)

1. Scaffold: Express+TS backend repo, frontend repo (Next.js or Vite+React), Neon DB + schema/migration, R2 bucket + presign endpoint, Upstash Redis + BullMQ setup.
2. Upload flow end-to-end (presign → direct R2 upload → note row → enqueue) + `/notes` list + `/notes/:id` detail page. Deploy early — "open a URL, no setup" is a hard requirement.
3. Test Gnani ASR API directly (curl/Postman) against a real 2+ min sample file — confirm request/response shape, sync-vs-job behavior, error format.
4. Implement worker process: transcribe stage + summarize stage, status transitions, error capture, retry endpoint.
5. Structured Claude summary prompt (key points / action items, not a generic paragraph).
6. Polling UI: step tracker + failure states + retry button + upload progress bar.
7. Write `/architecture` page (Section 11 outline).
8. Deploy both services (API+worker on Render/Railway, frontend on Vercel), set all env vars, smoke test with a real long audio file + a deliberately corrupt/empty file.
9. Submit: deployed URL + GitHub repo link via the form.

---

## 14. Verification Checklist

- [ ] Upload a real 2-3 min audio file end-to-end on the deployed URL; confirm visible status transitions and final transcript+summary.
- [ ] Upload a non-audio file and a 0-byte file; confirm clean, specific error messages, no crash.
- [ ] Reopen a past note from `/notes` after a full page refresh (proves DB persistence, not client state).
- [ ] Force an ASR failure (e.g. temporarily invalid API key) → confirm `status=failed`, error message, Retry button works and re-enqueues correctly.
- [ ] Force a summary-only failure → confirm transcript is preserved and only the summary stage retries.
- [ ] Confirm two rapid duplicate submissions of the same note don't double-process (job-ID idempotency).
- [ ] `/architecture` page accurately reflects the deployed system and links to the public GitHub repo.
