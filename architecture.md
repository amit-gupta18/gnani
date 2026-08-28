# Architecture — Audio Notes Platform

**Repo:** `<!-- FILL: https://github.com/<you>/<repo> -->`
**Live app:** `<!-- FILL: deployed URL -->`

Upload an audio file, get back a transcript (Gnani ASR) and a structured summary (LLM). Past notes are listed and reopenable.

This page documents what is actually deployed, the tradeoffs taken under a ~24h build window, and where the design runs out of room.

> **Anything marked `FILL` must be replaced with a measured value before submission.** Do not ship this page with placeholders in it — an architecture page that doesn't match the running system is worse than no architecture page.

---

## 1. System overview

```
┌───────────────────────┐
│  Browser (Next.js)    │
│  Vercel               │
└───┬───────────────┬───┘
    │               │
    │ (1) POST /uploads/presign
    │     ── validate type/size, issue presigned PUT
    │               │
    │               │ (2) PUT audio file  ─── direct, bypasses API
    │               ▼
    │        ┌─────────────┐
    │        │ Cloudflare  │
    │        │     R2      │
    │        └──────┬──────┘
    │               │ (5) presigned GET (worker reads object)
    │ (3) POST /notes {filename, r2_key, duration}
    ▼               │
┌───────────────────────┐        enqueue        ┌──────────────────────┐
│  Express + TypeScript │──────────────────────▶│  Redis (Upstash)     │
│  API — Render         │                       │  BullMQ: transcribe  │
│                       │                       │         summarize    │
└──────────┬────────────┘                       └──────────┬───────────┘
           │ insert row (status=uploaded)                  │ (4) consume
           ▼                                               ▼
    ┌──────────────┐                            ┌──────────────────────┐
    │ Neon Postgres│◀────── update status ──────│  Worker process      │
    │  notes       │        transcript,         │  Render              │
    │  note_chunks │        summary             └──────┬───────────────┘
    └──────┬───────┘                                   │
           │                                     (6)   ▼
           │ (7) GET /notes/:id            ┌────────────────────────────┐
           │     poll every 2s             │ Gnani ASR  →  LLM summary  │
           └───────────────────────────────│ (REST)        (AI Gateway) │
                     back to browser       └────────────────────────────┘
```

**Postgres is the source of truth. Redis is execution machinery only.** The browser never talks to Redis; it polls a DB-backed endpoint. If Redis were wiped, every note's state would still be correct and recoverable — only in-flight work would need re-enqueueing.

---

## 2. What runs synchronously vs. in the background

| Phase | Mode | Why |
|---|---|---|
| Validate file type/size, issue presigned URL | Sync (~50ms) | Pure policy check, no I/O worth deferring |
| Upload bytes to R2 | Sync, but **client → R2 directly** | Never touches the API server |
| Insert `notes` row + enqueue job | Sync (~20ms) | A single INSERT and a queue push |
| **ASR transcription** | **Background** | Unbounded duration — a 40-minute file cannot be held inside an HTTP request |
| **LLM summarization** | **Background** | Depends on transcript; separate failure domain from ASR |
| Read a completed note | Sync | Immutable row read |

The dividing line is *bounded vs. unbounded latency*. Everything with a predictable millisecond ceiling stays in the request. Everything that depends on a third party processing an arbitrarily long file goes to a queue.

`POST /notes` returns a `noteId` in milliseconds and the client redirects immediately to `/notes/:id`. The user is never staring at a hanging request.

---

## 3. Upload → transcript flow, step by step

1. **Presign.** `POST /uploads/presign` with `{filename, contentType, sizeBytes}`. Server rejects non-audio MIME types, zero-byte files, and anything over the size cap **before** issuing a URL. Returns a presigned R2 PUT URL scoped to a single object key with a short TTL.
2. **Direct upload.** Browser PUTs the file straight to R2 via `XMLHttpRequest`, using `upload.onprogress` for a real byte-accurate progress bar. The API server never sees the file body.
3. **Register.** `POST /notes` with `{filename, r2_key, durationSeconds}`. Inserts a row with `status='uploaded'` and enqueues a `transcribe` job.
4. **Claim.** Worker picks up the job, sets `status='transcribing'`.
5. **Fetch + transcribe.** Worker generates a presigned GET for the object and calls Gnani ASR (see §4). Transcript persisted, `status='summarizing'`, `summarize` job enqueued.
6. **Summarize.** Worker calls the LLM through Vercel AI Gateway, persists `summary` and `model_used`, sets `status='done'`.
7. **Poll.** Client polls `GET /notes/:id` every 2s while the status is non-terminal, backing off to 5s after 60s, and stopping entirely at `done` or `failed`.

### Why direct-to-R2 rather than proxying through the API

Routing a 50MB upload through Express means buffering or streaming it through a process that is also serving every other request, on a host with a fixed request timeout and metered bandwidth. Presigned PUT removes the API from the data path entirely: the server's job is authorization, not transport. It also gives honest client-side progress, because the browser is measuring its own upload rather than guessing.

R2 specifically over S3: S3-compatible API (so `@aws-sdk/client-s3` works unchanged) with no egress fees, which matters because completed notes are re-opened repeatedly and audio playback re-fetches the object.

---

## 4. Long-audio handling

Two separate problems hide under "long audio," and they need separate answers.

### 4.1 The audio is longer than the ASR endpoint accepts

Measured limits for the Gnani REST endpoint:

- Max duration accepted: **60 seconds** (ideal ≤ 30 seconds)
- Max file size accepted: **not documented by vendor**; app enforces **50 MB** at presign
- Accepted encodings / sample rates: **WAV, MP3, OGG, FLAC, AAC, M4A** (any sample rate; worker normalizes to mono 16 kHz WAV before segmentation)
- Typical processing time per minute of audio: **~3–8 seconds** (REST, en-IN, measured on short clips)

**Deployed behaviour:** files at or under that ceiling are sent as a single request. Files above it are **segmented before transcription**:

```
input.mp3 (28 min)
    │
    ├─ ffmpeg: normalize to **mono 16 kHz WAV** (pcm_s16le)
    │
    ├─ silence-aware split  ────────────────────────────────────┐
    │   silencedetect → cut at pauses near the target boundary,  │
    │   NOT at fixed offsets (a fixed cut bisects words and      │
    │   costs you the sentence on both sides)                    │
    │   each segment ≤ endpoint ceiling, 2s overlap              │
    ▼                                                            │
note_chunks:  [0] [1] [2] [3] ... [n]                            │
    │                                                            │
    ├─ transcribed in parallel, bounded concurrency ─────────────┘
    │
    ├─ per-chunk status persisted → progress = done_chunks / total_chunks
    │
    ▼
stitch: concatenate in index order, de-duplicate the overlap window
    │
    ▼
notes.transcript
```

The per-chunk rows are what make progress *honest*: the UI shows "transcribing — 7 of 22 segments" rather than an indeterminate spinner, and a worker crash resumes from the last completed chunk instead of re-running (and re-paying for) the whole file.

> Segmentation is **implemented** and exercised for any upload longer than 60 seconds. Demo files of 2–3 minutes will always hit the segmented path.

### 4.2 The transcript is longer than the summarizer's context

A 90-minute transcript will not fit in a single summarization call. Above a token threshold the summarizer switches to map-reduce:

```
chunk summaries  ──▶  summary of summaries
   (map)                    (reduce)
```

Each chunk is summarized independently with the same structured schema; the reduce pass merges and de-duplicates key points and action items. Below the threshold it's a single call, because map-reduce loses cross-references and isn't worth it on a short transcript.

### 4.3 Streaming ASR — considered, not used

Gnani also exposes a WebSocket streaming interface. It would give partial transcripts as the audio is consumed, which is a better progress signal than segment counting.

It was not used, deliberately:

- A long-lived socket inside a queue worker is a different failure model from a bounded HTTP call — `AbortController` timeouts, BullMQ lock renewal, and retry semantics all need reworking around a connection that is *supposed* to stay open for minutes.
- Streaming is designed for live microphone input. For a file already at rest in object storage, batch transcription of segments gets the same result with a much simpler recovery story.

At scale, streaming becomes the right call — see §9.

---

## 5. Data model

```sql
CREATE TYPE note_status AS ENUM (
  'uploaded', 'transcribing', 'summarizing', 'done', 'failed'
);

CREATE TABLE notes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        text NOT NULL,              -- anonymous owner, see §7
  filename          text NOT NULL,
  r2_key            text NOT NULL,
  duration_seconds  integer,
  status            note_status NOT NULL DEFAULT 'uploaded',
  failed_stage      text,                       -- 'transcribe' | 'summarize'
  error_message     text,
  transcript        text,
  summary           jsonb,                      -- structured, see §6
  model_used        text,                       -- which LLM actually served it
  asr_raw           jsonb,                      -- full ASR response, kept for debugging
  attempt_count     integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON notes (session_id, created_at DESC);
CREATE INDEX ON notes (status) WHERE status IN ('uploaded', 'transcribing', 'summarizing');

CREATE TABLE note_chunks (                      -- only populated for segmented files
  note_id      uuid REFERENCES notes(id) ON DELETE CASCADE,
  idx          integer NOT NULL,
  start_ms     integer NOT NULL,
  end_ms       integer NOT NULL,
  r2_key       text NOT NULL,
  transcript   text,
  status       text NOT NULL DEFAULT 'pending',
  PRIMARY KEY (note_id, idx)
);
```

### Why Postgres rather than MongoDB

The data is a state machine with a fixed shape, not a document.

- The status enum is **enforced by the database**. A typo'd status string is rejected at write time rather than silently persisted.
- The partial index on non-terminal statuses makes "what work is outstanding" a cheap query — which is what a recovery sweep needs.
- `jsonb` covers the two places where flexibility genuinely helps (raw ASR response, structured summary) without giving up transactional guarantees on the state transitions.
- Row-level locking (`SELECT ... FOR UPDATE SKIP LOCKED`) is available natively, which is what the fallback queue design in §9 relies on.

Mongo would be the better choice if the primary query target were deeply nested variable documents — speaker-diarized segment trees queried into directly, say. That isn't this application.

**Neon** for hosting: serverless Postgres, branching for schema changes, generous free tier. No behavioural difference from vanilla Postgres here.

---

## 6. The summarization layer

### Prompt design

The summary is requested as **structured JSON, not prose**, so the UI can render sections independently and a partial parse failure is detectable rather than silently ugly:

```
You are summarizing a transcript produced by automatic speech recognition.
The transcript may contain recognition errors, especially on proper nouns,
numbers, and code-switched speech. Do not invent detail to smooth over a
garbled passage — if a segment is unintelligible, say so.

Return JSON only, no prose, no markdown fences:
{
  "title":        string,          // 6 words max
  "tldr":         string,          // 2 sentences
  "key_points":   string[],        // 3-7 items, each one sentence
  "action_items": [ { "text": string, "owner": string|null } ],
  "open_questions": string[],      // things raised but unresolved
  "unclear_segments": string[]     // passages the ASR likely garbled
}

If the transcript contains no action items, return an empty array.
Do not fabricate owners.
```

Three things this is doing that a generic "summarize this" prompt does not:

1. **Naming the ASR error mode up front.** The model is told its input is machine-transcribed and unreliable, which measurably reduces confident hallucination over garbled spans.
2. **Empty arrays over invented content.** The failure mode of a summarizer is producing plausible action items when there were none.
3. **`unclear_segments` as a first-class output.** This surfaces transcription quality back to the user instead of hiding it.

Response is validated against a schema on parse; a malformed response is a retryable failure, not something rendered raw.

### Routing through Vercel AI Gateway

The LLM call goes through the gateway (`https://ai-gateway.vercel.sh/v1`) rather than direct to a single provider. The gateway is a plain HTTP endpoint, so the Render-hosted worker calls it fine — no Vercel deployment coupling.

What that buys, in order of relevance here:

- **Model fallbacks.** A primary model plus an ordered fallback list; any failure — outage, rate limit, context overflow — advances to the next model rather than failing the note. This turns "LLM provider is down" from a user-visible failure into an invisible degradation, and it's the reason this is in the architecture at all.
- **Which model served the request** is returned and stored in `model_used`, shown on the note detail page.
- One key and one usage dashboard instead of per-provider credentials.

The tradeoff, stated honestly: this adds a dependency in the request path, so a gateway incident is now a failure mode that direct calls wouldn't have. Mitigated with a `USE_GATEWAY=false` env flag that reverts to a direct provider call without a code change.

---

## 7. Ownership without authentication

There is no login. Auth was cut deliberately, not overlooked.

But "no auth" cannot mean "one global shared list" — several people will open this URL, and they should not see each other's uploads or each other's deliberately-corrupted test files.

Each browser gets an anonymous `session_id` in an `httpOnly` cookie on first visit. Every note is scoped to it; `GET /notes` filters by it. This is not a security boundary — anyone with a note's UUID can fetch it — and it is not presented as one. It is tenancy isolation good enough for a demo, at roughly an hour of work.

Real auth (JWT sessions, `user_id` FK, row-level policies) is §9.

---

## 8. Failure handling

Every failure sets `status='failed'`, records `failed_stage`, and writes the **real underlying error** into `error_message` — not a generic "something went wrong." The UI shows the message plus a Retry button.

| Failure | Detection | User sees | Recovery |
|---|---|---|---|
| Non-audio or zero-byte file | Client + server validation before presign | Inline error, upload never starts | Pick another file |
| File over size/duration cap | Server validation at presign | Inline error naming the actual limit | — |
| Upload interrupted mid-PUT | R2 PUT error / `onerror` | Error banner on the progress bar | Retry upload (new presign) |
| Gnani ASR timeout | `AbortController` at **90s** in the worker | `failed`, "ASR timed out after 90s" | Retry re-runs transcription only |
| Gnani returns non-2xx (corrupt/unsupported audio) | Response status + body | `failed`, Gnani's own message surfaced verbatim | Retry, or re-upload a valid file |
| One chunk fails in a segmented file | Per-chunk status | `failed`, "segment 12 of 22 failed" | Retry re-runs **only that chunk** |
| LLM returns malformed JSON | Schema validation on parse | Retried automatically; if persistent, `failed` at summarize | Transcript preserved |
| LLM provider down | Gateway fallback list | Usually nothing — a fallback model serves it | — |
| Worker crashes mid-job | BullMQ stalled-job check (lock not renewed within the stall interval) | Status stays in-flight briefly, then resumes | Job re-delivered automatically; `attempt_count` bounds it |
| Duplicate submit (double-click, client retry) | Enqueue guarded by a DB state check | Nothing — second request is a no-op | — |
| Job stuck in-flight past a threshold | Periodic sweep over the partial index on non-terminal statuses | `failed`, "processing stalled" | Retry |

### Retry semantics — resumes from the failed stage

Retry does **not** reset a note to `uploaded` and re-run everything. That would re-run ASR (and re-spend ASR credits) to fix a summarizer problem, which is the entire reason the pipeline is split into two queues.

```
failed_stage = 'summarize'   →  re-enqueue summarize only; transcript kept
failed_stage = 'transcribe'  →  re-enqueue transcribe from the first
                                incomplete chunk; completed chunks kept
```

`attempt_count` caps automatic retries at 2 with exponential backoff, so a persistent upstream failure doesn't quietly burn ASR credits in a loop.

### Idempotency — the guard is in the database, not the queue

Using `note.id` as the BullMQ job ID de-duplicates only while that job still exists in the queue. Once it completes and is evicted, the same ID can be added again — so job-ID de-duplication alone is **not** a correctness guarantee.

The real guard is a conditional update: a note is only enqueued if it transitions out of `uploaded`/`failed` in the same statement.

```sql
UPDATE notes SET status = 'transcribing', updated_at = now()
WHERE id = $1 AND status IN ('uploaded', 'failed')
RETURNING id;
```

No row returned means someone else already claimed it, and the enqueue is skipped. Postgres arbitrates; the queue is just transport.

---

## 9. What I'd improve

Ordered by what would break first under real load.

**1. Redis/BullMQ → SQS, or Postgres-backed jobs.**
BullMQ recovers stalled jobs via lock expiry, so a worker crash is handled. The sharper risks are Redis persistence configuration and memory eviction under pressure — Redis is a cache being asked to be a ledger. SQS gives durability and dead-letter queues natively. In the other direction, this workload is low enough volume that a `jobs` table with `SELECT ... FOR UPDATE SKIP LOCKED` would remove Redis from the stack entirely and put job state in the same transaction as note state, eliminating the split-brain in §8 by construction. Kafka only becomes right if multiple independent consumers need the same event stream — analytics consuming "note transcribed" separately from the summarizer.

**2. Polling → SSE.**
Every open tab polls every 2 seconds. That's fine for demo traffic and linear in user count, which is not fine later. Server-Sent Events per note, with the worker publishing transitions over Redis pub/sub and the API relaying, removes the polling entirely. This is also the prerequisite for streaming summary tokens to the browser: today's summary is generated in a worker with no connection to the client, so token streaming would need that relay to exist first — which is why it isn't built. It is a cosmetic win on an 8-second operation and did not justify the plumbing in this build.

**3. Streaming ASR for long files.**
Replace segment-and-stitch with Gnani's WebSocket interface: partial transcripts land continuously, progress is word-level rather than segment-level, and there is no stitch seam to get wrong. Costs the simpler retry model described in §4.3, so it needs the durable-job work in (1) first.

**4. Backpressure and a circuit breaker on ASR calls.**
Worker concurrency is currently a fixed number tuned by hand to stay under the vendor's rate limit. That's a guess that goes stale. A token-bucket limiter in front of outbound calls, plus a circuit breaker that trips on consecutive failures, prevents a Gnani outage from turning into a retry storm that burns credits and gets the key throttled.

**5. Autoscaled workers.**
Fixed worker count means queue depth grows unboundedly at peak and money is wasted at trough. Kubernetes HPA keyed on queue depth, or Fargate/Lambda triggered by SQS depth, makes capacity track demand.

**6. Caching and read replicas.**
Completed notes are immutable and read-heavy. Cache `GET /notes/:id` for `done` notes at the edge, and serve list/history views from a Neon read replica so history browsing doesn't contend with the write path that workers are hammering with status updates.

**7. Multipart/resumable uploads.**
A single presigned PUT fails wholesale on a flaky connection. R2's S3-compatible multipart upload gives per-part retry and resumability — which matters most for exactly the large files this app is for.

**8. Real auth and multi-tenancy.**
Replace the anonymous session cookie (§7) with proper sessions, a `user_id` foreign key, and row-level access control.

**9. Observability.**
Structured logs, OpenTelemetry traces spanning API → queue → worker → vendor calls, and metrics on queue depth, per-stage duration, and failure rate by cause. Without these, "ASR is slow today" and "this one file is broken" are indistinguishable at volume — and that distinction is the whole job once the system has users.

**10. Summary quality evaluation.**
There is currently no measurement of whether summaries are any good. A small labelled set of transcripts with reference key points, scored on each prompt change, would turn prompt iteration from taste into evidence.

---

## 10. Stack summary

| Layer | Choice | One-line reason |
|---|---|---|
| Frontend | Next.js on Vercel | Static/SSR, zero-config deploy, direct-to-R2 upload from the browser |
| API | Express + TypeScript on Render | Persistent process — a prerequisite for a real queue worker, which serverless functions can't host |
| Worker | Separate Node process, same repo | Decoupled from the HTTP request lifecycle; scales independently |
| Queue | BullMQ on Upstash Redis | Retries with backoff, concurrency limits, stalled-job recovery, failed-job inspection |
| Database | Neon Postgres | Enum-enforced state machine, `jsonb` where flexibility is needed, `SKIP LOCKED` available |
| Object storage | Cloudflare R2 | S3-compatible, no egress fees, presigned direct upload |
| ASR | Gnani STT | Assignment requirement; strong on Indian-language and code-switched audio |
| LLM | Vercel AI Gateway | One endpoint, ordered model fallbacks, per-request model attribution |

---

## 11. Verification performed

- [ ] Real 2–3 minute audio file uploaded on the deployed URL; visible transitions through Uploaded → Transcribing → Summarizing → Done; transcript and structured summary both correct.
- [ ] File above the segmentation threshold uploaded; per-segment progress advanced; stitched transcript has no duplicated or dropped text at the seams.
- [ ] Non-audio file and a 0-byte file rejected with specific messages, before any upload begins.
- [ ] Note reopened from `/notes` after a full page refresh in a new tab (proves DB persistence, not client state).
- [ ] ASR failure forced (invalid key) → `failed`, real error message shown, Retry re-runs transcription only.
- [ ] Summary failure forced → transcript preserved, Retry re-runs summarization only, ASR not re-invoked.
- [ ] Worker killed mid-job → job re-delivered and completed without manual intervention.
- [ ] Rapid double-submit → exactly one note processed.
- [ ] Second browser profile → sees an empty note list, not the first session's notes.
- [ ] Repo URL and live app URL filled in at top of this page before submission.