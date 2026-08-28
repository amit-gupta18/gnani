import type { Metadata } from "next";
import {
  SystemOverviewDiagram,
  UploadFlowSteps,
  SegmentationDiagram,
  MapReduceDiagram,
  SchemaDiagram,
  RetryFlowDiagram,
} from "@/components/architecture/diagrams";

export const metadata: Metadata = {
  title: "Architecture — Audio Notes",
};

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8 border-t border-[var(--border)] py-10 first:border-t-0 first:pt-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary)]">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-bold">{title}</h2>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function DiagramCard({ children, caption }: { children: React.ReactNode; caption?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-5">
      {children}
      {caption && <p className="mt-3 text-xs text-[var(--muted)]">{caption}</p>}
    </div>
  );
}

export default function ArchitecturePage() {
  return (
    <div className="max-w-none">
      <header className="mb-10">
        <h1 className="text-2xl font-bold">Architecture</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Upload an audio file, get back a transcript (Gnani ASR) and a structured summary (LLM).
          This page documents what is actually deployed — the shape of the system, the long-audio
          pipeline that drives most of the design, and where it would break first under load.
        </p>
      </header>

      <nav className="mb-10 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
        {[
          ["overview", "Overview"],
          ["upload-flow", "Upload → transcript"],
          ["long-audio", "Long audio"],
          ["schema", "Schema"],
          ["summarization", "Summarization"],
          ["failures", "Failure handling"],
          ["improve", "What I'd improve"],
        ].map(([href, label]) => (
          <a key={href} href={`#${href}`} className="hover:text-[var(--foreground)] hover:underline">
            {label}
          </a>
        ))}
      </nav>

      <Section id="overview" eyebrow="01" title="System overview">
        <DiagramCard caption="Postgres is the source of truth; Redis is execution machinery only. The browser never talks to Redis — it polls a DB-backed endpoint, so a wiped queue loses no note state, only in-flight work to re-enqueue.">
          <SystemOverviewDiagram />
        </DiagramCard>
      </Section>

      <Section id="upload-flow" eyebrow="02" title="Upload → transcript, step by step">
        <UploadFlowSteps />
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          Upload goes browser → R2 directly (presigned PUT), never through the API — so a 50MB file
          never buffers through a request process, and progress is measured on the browser&apos;s own
          upload rather than guessed.
        </p>
      </Section>

      <Section id="long-audio" eyebrow="03" title="Long audio handling">
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          Two separate limits hide under &ldquo;long audio&rdquo;: the ASR endpoint&apos;s per-request duration
          cap, and the summarizer&apos;s context window. Each gets its own pipeline.
        </p>

        <div>
          <h3 className="mb-2 text-sm font-semibold">3.1 — Audio longer than the ASR limit</h3>
          <DiagramCard caption="Split at silence, not fixed offsets — a fixed cut bisects words and costs the sentence on both sides. Per-chunk status makes progress honest and a crash resumable instead of re-billing the whole file.">
            <SegmentationDiagram />
          </DiagramCard>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 text-xs">
          {[
            ["Max duration / request", "60s (ideal ≤30s)"],
            ["App size cap", "50 MB, enforced at presign"],
            ["Encodings accepted", "WAV/MP3/OGG/FLAC/AAC/M4A"],
            ["Throughput", "~3–8s per min of audio"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-[var(--border)] bg-white p-3">
              <p className="text-[var(--muted)]">{k}</p>
              <p className="mt-1 font-medium">{v}</p>
            </div>
          ))}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">3.2 — Transcript longer than the summarizer&apos;s context</h3>
          <DiagramCard caption="Below a token threshold: one call. Above it: map-reduce — losing cross-references only matters on long transcripts, so short ones skip straight to a single call.">
            <MapReduceDiagram />
          </DiagramCard>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-white p-4 text-sm leading-relaxed text-[var(--muted)]">
          <span className="font-medium text-[var(--foreground)]">Streaming ASR — considered, not used.</span>{" "}
          Gnani&apos;s WebSocket interface gives word-level progress but trades the bounded-HTTP retry model
          for a long-lived connection inside a queue worker. For audio already at rest in object storage,
          batch segmentation gets the same result with a far simpler recovery story. Revisit once durable
          job storage (§9) exists.
        </div>
      </Section>

      <Section id="schema" eyebrow="04" title="Data model">
        <DiagramCard caption="notes is the state machine (enum-enforced status); note_chunks only exists for segmented files. jsonb is used only where the shape genuinely varies — the raw ASR response and the structured summary.">
          <SchemaDiagram />
        </DiagramCard>
      </Section>

      <Section id="summarization" eyebrow="05" title="Summarization layer">
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          The summary is requested as structured JSON, validated on parse — a malformed response is a
          retryable failure, not something rendered raw. The prompt names the ASR error mode up front
          and requires empty arrays over invented action items.
        </p>
        <DiagramCard>
          <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[1fr_auto_1fr] text-sm">
            <div className="rounded-lg border border-[var(--border)] p-3">
              <p className="font-medium">Transcript</p>
              <p className="text-xs text-[var(--muted)]">raw, possibly garbled ASR output</p>
            </div>
            <span className="text-[var(--muted)]">→ LLM →</span>
            <div className="rounded-lg border border-[var(--primary)] p-3">
              <p className="font-medium">Structured summary</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                title · tldr · key_points[] · action_items[] · open_questions[] · unclear_segments[]
              </p>
            </div>
          </div>
        </DiagramCard>
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          Routed through Vercel AI Gateway rather than a single provider: an ordered fallback list turns
          a provider outage into an invisible model swap instead of a failed note, and{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">model_used</code> is recorded per
          note. <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">USE_GATEWAY=false</code> reverts
          to a direct provider call if the gateway itself is the problem.
        </p>
      </Section>

      <Section id="failures" eyebrow="06" title="Failure handling">
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          Every failure sets <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">status=&apos;failed&apos;</code>,
          records which stage failed, and surfaces the <span className="font-medium text-[var(--foreground)]">real underlying error</span> —
          never a generic message. Retry resumes from the failed stage; it never re-runs ASR to fix a
          summarizer problem.
        </p>
        <DiagramCard>
          <RetryFlowDiagram />
        </DiagramCard>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            ["Chunk failure", "Only that chunk retries — not the whole file."],
            ["Worker crash", "BullMQ stalled-job check re-delivers automatically."],
            ["Duplicate submit", "DB state-check guard makes the second request a no-op."],
            ["Stuck in-flight", "Periodic sweep over the non-terminal partial index → failed."],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-[var(--error)]/30 bg-white p-3 text-sm">
              <p className="font-medium">{k}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{v}</p>
            </div>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          Idempotency lives in the database, not the queue: job-ID de-dup only holds while a job is
          still in BullMQ. The real guard is a conditional{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
            UPDATE ... WHERE status IN (&apos;uploaded&apos;,&apos;failed&apos;)
          </code>{" "}
          — no row returned means someone already claimed it.
        </p>
      </Section>

      <Section id="improve" eyebrow="07" title="What I'd improve">
        <p className="text-sm leading-relaxed text-[var(--muted)]">Ordered by what would break first under real load.</p>
        <ol className="space-y-3">
          {[
            ["Redis/BullMQ → durable jobs", "Redis is a cache being asked to be a ledger. SQS, or a Postgres jobs table with SKIP LOCKED, removes that risk and closes the split-brain between job state and note state."],
            ["Polling → SSE", "Every open tab polls every 2s — linear in user count. Worker-published transitions over pub/sub, relayed as SSE, also unlocks streaming summary tokens."],
            ["Streaming ASR for long files", "Gnani's WebSocket interface gives word-level progress with no stitch seam — needs the durable-job work above first."],
            ["Backpressure + circuit breaker", "Worker concurrency is a hand-tuned guess against the vendor rate limit. A token-bucket limiter plus a breaker stops an outage from becoming a retry storm."],
            ["Autoscaled workers", "Fixed worker count over- or under-provisions at peak/trough. Scale on queue depth instead."],
            ["Caching + read replicas", "Completed notes are immutable and read-heavy — cache done notes at the edge, serve history from a replica."],
            ["Resumable multipart uploads", "A single presigned PUT fails wholesale on a flaky connection — worst for exactly the large files this app targets."],
            ["Real auth & multi-tenancy", "Replace the anonymous session cookie with real sessions, a user_id FK, and row-level access control."],
            ["Observability", "Structured logs + traces spanning API → queue → worker → vendor, and metrics on queue depth and failure rate by cause."],
            ["Summary quality evaluation", "No current measurement of summary quality — a small labelled eval set would turn prompt iteration into evidence."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3 rounded-lg border border-[var(--border)] bg-white p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-[var(--muted)]">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium">{t}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
