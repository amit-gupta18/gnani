// Inline SVG diagrams for the /architecture page.
// Kept as plain SVG (no chart lib) so the page has zero extra runtime weight.

const BOX = "fill-white stroke-[var(--border)]";
const LABEL = "fill-[var(--foreground)] text-[11px] font-medium";
const SUB = "fill-[var(--muted)] text-[10px]";
const ARROW = "stroke-[var(--muted)]";

function Arrowhead({ id, color = "var(--muted)" }: { id: string; color?: string }) {
  return (
    <marker id={id} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill={color} />
    </marker>
  );
}

export function SystemOverviewDiagram() {
  return (
    <svg viewBox="0 0 900 460" className="w-full" role="img" aria-label="System overview">
      <defs>
        <Arrowhead id="ov-arrow" />
        <Arrowhead id="ov-arrow-primary" color="var(--primary)" />
      </defs>

      {/* Browser */}
      <rect x="20" y="20" width="180" height="60" rx="10" className={BOX} strokeWidth="1.5" />
      <text x="110" y="45" textAnchor="middle" className={LABEL}>Browser</text>
      <text x="110" y="62" textAnchor="middle" className={SUB}>Next.js · Vercel</text>

      {/* R2 */}
      <rect x="360" y="20" width="180" height="60" rx="10" className={BOX} strokeWidth="1.5" />
      <text x="450" y="45" textAnchor="middle" className={LABEL}>Cloudflare R2</text>
      <text x="450" y="62" textAnchor="middle" className={SUB}>object storage</text>

      {/* API */}
      <rect x="20" y="160" width="180" height="60" rx="10" className={BOX} strokeWidth="1.5" stroke="var(--primary)" />
      <text x="110" y="185" textAnchor="middle" className={LABEL}>API</text>
      <text x="110" y="202" textAnchor="middle" className={SUB}>Express · Render</text>

      {/* Postgres */}
      <rect x="20" y="300" width="180" height="70" rx="10" className={BOX} strokeWidth="1.5" />
      <text x="110" y="326" textAnchor="middle" className={LABEL}>Neon Postgres</text>
      <text x="110" y="343" textAnchor="middle" className={SUB}>notes</text>
      <text x="110" y="357" textAnchor="middle" className={SUB}>note_chunks</text>

      {/* Redis/Queue */}
      <rect x="360" y="160" width="180" height="60" rx="10" className={BOX} strokeWidth="1.5" />
      <text x="450" y="185" textAnchor="middle" className={LABEL}>Redis · BullMQ</text>
      <text x="450" y="202" textAnchor="middle" className={SUB}>transcribe / summarize</text>

      {/* Worker */}
      <rect x="360" y="300" width="180" height="60" rx="10" className={BOX} strokeWidth="1.5" stroke="var(--primary)" />
      <text x="450" y="325" textAnchor="middle" className={LABEL}>Worker</text>
      <text x="450" y="342" textAnchor="middle" className={SUB}>Render, separate process</text>

      {/* Vendors */}
      <rect x="680" y="240" width="200" height="60" rx="10" className={BOX} strokeWidth="1.5" strokeDasharray="4 3" />
      <text x="780" y="265" textAnchor="middle" className={LABEL}>Gnani ASR</text>
      <text x="780" y="282" textAnchor="middle" className={SUB}>REST, per-segment</text>

      <rect x="680" y="320" width="200" height="60" rx="10" className={BOX} strokeWidth="1.5" strokeDasharray="4 3" />
      <text x="780" y="345" textAnchor="middle" className={LABEL}>Vercel AI Gateway</text>
      <text x="780" y="362" textAnchor="middle" className={SUB}>LLM + fallback list</text>

      {/* edges */}
      {/* Browser -> R2 (1 presign, 2 PUT) */}
      <line x1="200" y1="40" x2="358" y2="40" className={ARROW} strokeWidth="1.5" markerEnd="url(#ov-arrow)" />
      <text x="280" y="32" textAnchor="middle" className={SUB}>2 · PUT file</text>

      {/* Browser -> API (1 presign, 3 register) */}
      <path d="M110,80 L110,158" fill="none" className={ARROW} strokeWidth="1.5" markerEnd="url(#ov-arrow)" />
      <text x="118" y="120" className={SUB}>1 presign · 3 register</text>

      {/* API -> Postgres */}
      <path d="M110,220 L110,298" fill="none" className={ARROW} strokeWidth="1.5" markerEnd="url(#ov-arrow)" />
      <text x="118" y="262" className={SUB}>insert row</text>

      {/* API -> Redis */}
      <path d="M200,180 L358,185" fill="none" className={ARROW} strokeWidth="1.5" markerEnd="url(#ov-arrow-primary)" stroke="var(--primary)" />
      <text x="250" y="172" className={SUB}>enqueue</text>

      {/* Redis -> Worker */}
      <path d="M450,220 L450,298" fill="none" className={ARROW} strokeWidth="1.5" markerEnd="url(#ov-arrow-primary)" stroke="var(--primary)" />
      <text x="458" y="262" className={SUB}>consume</text>

      {/* Worker -> Postgres */}
      <path d="M358,340 L200,335" fill="none" className={ARROW} strokeWidth="1.5" markerEnd="url(#ov-arrow)" />
      <text x="215" y="365" className={SUB}>write status / transcript / summary</text>

      {/* Worker -> R2 (read) */}
      <path d="M470,298 C 520,240 500,110 460,82" fill="none" className={ARROW} strokeWidth="1.5" strokeDasharray="3 3" markerEnd="url(#ov-arrow)" />
      <text x="560" y="180" className={SUB}>presigned GET</text>

      {/* Worker -> vendors */}
      <path d="M540,310 L678,275" fill="none" className={ARROW} strokeWidth="1.5" markerEnd="url(#ov-arrow)" />
      <path d="M540,330 L678,345" fill="none" className={ARROW} strokeWidth="1.5" markerEnd="url(#ov-arrow)" />

      {/* Browser polls API */}
      <path d="M25,80 C -10,120 -10,160 22,178" fill="none" className={ARROW} strokeWidth="1.5" strokeDasharray="3 3" markerEnd="url(#ov-arrow)" />
      <text x="-8" y="130" className={SUB} transform="rotate(-90 -8,130)">poll GET /notes/:id</text>
    </svg>
  );
}

export function UploadFlowSteps() {
  const steps = [
    { n: 1, t: "Presign", d: "Validate type/size, issue scoped presigned PUT" },
    { n: 2, t: "Direct upload", d: "Browser PUTs bytes straight to R2 — API never sees the file" },
    { n: 3, t: "Register", d: "POST /notes inserts row, enqueues transcribe job" },
    { n: 4, t: "Claim", d: "Worker picks up job, status → transcribing" },
    { n: 5, t: "Transcribe", d: "Presigned GET, calls Gnani ASR, enqueues summarize" },
    { n: 6, t: "Summarize", d: "LLM via AI Gateway, status → done" },
    { n: 7, t: "Poll", d: "Client polls every 2s, backs off, stops at terminal state" },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s) => (
        <div key={s.n} className="relative rounded-lg border border-[var(--border)] bg-white p-4">
          <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-semibold text-white">
            {s.n}
          </div>
          <p className="text-sm font-medium">{s.t}</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{s.d}</p>
        </div>
      ))}
    </div>
  );
}

export function SegmentationDiagram() {
  const chunks = [0, 1, 2, 3, 4];
  return (
    <svg viewBox="0 0 900 300" className="w-full" role="img" aria-label="Long audio segmentation pipeline">
      <defs>
        <Arrowhead id="seg-arrow" />
      </defs>

      <rect x="20" y="20" width="200" height="50" rx="8" className={BOX} strokeWidth="1.5" />
      <text x="120" y="50" textAnchor="middle" className={LABEL}>input.mp3 (28 min)</text>

      <path d="M120,70 L120,105" className={ARROW} strokeWidth="1.5" fill="none" markerEnd="url(#seg-arrow)" />
      <rect x="20" y="105" width="200" height="50" rx="8" className={BOX} strokeWidth="1.5" />
      <text x="120" y="126" textAnchor="middle" className={LABEL}>ffmpeg normalize</text>
      <text x="120" y="142" textAnchor="middle" className={SUB}>mono · 16kHz · WAV</text>

      <path d="M120,155 L120,190" className={ARROW} strokeWidth="1.5" fill="none" markerEnd="url(#seg-arrow)" />
      <rect x="20" y="190" width="200" height="60" rx="8" className={BOX} strokeWidth="1.5" stroke="var(--primary)" />
      <text x="120" y="213" textAnchor="middle" className={LABEL}>silence-aware split</text>
      <text x="120" y="229" textAnchor="middle" className={SUB}>cut at pauses, not fixed offsets</text>
      <text x="120" y="243" textAnchor="middle" className={SUB}>2s overlap between segments</text>

      <path d="M220,220 L280,220" className={ARROW} strokeWidth="1.5" fill="none" markerEnd="url(#seg-arrow)" />

      {chunks.map((c, i) => (
        <g key={c}>
          <rect x={290 + i * 70} y="195" width="55" height="50" rx="6" className={BOX} strokeWidth="1.5" />
          <text x={290 + i * 70 + 27} y="224" textAnchor="middle" className={SUB}>chunk {c}</text>
        </g>
      ))}
      <text x="290" y="270" className={SUB}>note_chunks — transcribed in parallel, bounded concurrency</text>

      <path d="M670,220 L710,220" className={ARROW} strokeWidth="1.5" fill="none" markerEnd="url(#seg-arrow)" />
      <rect x="715" y="180" width="165" height="90" rx="8" className={BOX} strokeWidth="1.5" stroke="var(--primary)" />
      <text x="797" y="205" textAnchor="middle" className={LABEL}>Stitch</text>
      <text x="797" y="223" textAnchor="middle" className={SUB}>concatenate by index,</text>
      <text x="797" y="237" textAnchor="middle" className={SUB}>de-dupe overlap window</text>
      <text x="797" y="255" textAnchor="middle" className={SUB}>→ notes.transcript</text>

      <text x="290" y="60" className={SUB}>progress = done_chunks / total_chunks</text>
      <path d="M355,220 C 355,90 355,60 285,60" className={ARROW} strokeWidth="1" fill="none" strokeDasharray="2 3" />
    </svg>
  );
}

export function MapReduceDiagram() {
  return (
    <svg viewBox="0 0 700 180" className="w-full" role="img" aria-label="Map-reduce summarization for long transcripts">
      <defs>
        <Arrowhead id="mr-arrow" />
      </defs>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={20 + i * 110} y="20" width="90" height="45" rx="6" className={BOX} strokeWidth="1.5" />
          <text x={65 + i * 110} y="47" textAnchor="middle" className={SUB}>chunk summary {i + 1}</text>
          <path d={`M${65 + i * 110},65 L${340},110`} className={ARROW} strokeWidth="1" fill="none" strokeDasharray="2 3" />
        </g>
      ))}
      <text x="230" y="100" className={SUB}>map — same schema, independent</text>

      <rect x="290" y="115" width="180" height="50" rx="8" className={BOX} strokeWidth="1.5" stroke="var(--primary)" />
      <text x="380" y="138" textAnchor="middle" className={LABEL}>reduce</text>
      <text x="380" y="154" textAnchor="middle" className={SUB}>merge + de-dupe key points</text>

      <path d="M470,140 L560,140" className={ARROW} strokeWidth="1.5" fill="none" markerEnd="url(#mr-arrow)" />
      <rect x="565" y="115" width="120" height="50" rx="8" className={BOX} strokeWidth="1.5" />
      <text x="625" y="138" textAnchor="middle" className={LABEL}>final summary</text>
      <text x="625" y="154" textAnchor="middle" className={SUB}>notes.summary</text>
    </svg>
  );
}

export function SchemaDiagram() {
  return (
    <svg viewBox="0 0 760 420" className="w-full" role="img" aria-label="Database schema and relationships">
      <defs>
        <Arrowhead id="sc-arrow" />
      </defs>

      {/* notes table */}
      <rect x="30" y="20" width="330" height="330" rx="10" className={BOX} strokeWidth="1.5" stroke="var(--primary)" />
      <rect x="30" y="20" width="330" height="34" rx="10" fill="var(--primary)" />
      <text x="195" y="43" textAnchor="middle" className="fill-white text-[12px] font-semibold">notes</text>

      {[
        ["id", "uuid PK"],
        ["session_id", "text"],
        ["filename / r2_key", "text"],
        ["duration_seconds", "int"],
        ["status", "enum · uploaded→failed"],
        ["failed_stage / error_message", "text"],
        ["transcript", "text"],
        ["summary", "jsonb"],
        ["model_used", "text"],
        ["asr_raw", "jsonb"],
        ["attempt_count", "int"],
        ["created_at / updated_at", "timestamptz"],
      ].map(([k, v], i) => (
        <g key={k}>
          <text x="46" y={76 + i * 24} className="fill-[var(--foreground)] text-[11px]">{k}</text>
          <text x="360" y={76 + i * 24} textAnchor="end" className={SUB}>{v}</text>
        </g>
      ))}

      {/* note_chunks table */}
      <rect x="440" y="90" width="290" height="220" rx="10" className={BOX} strokeWidth="1.5" />
      <rect x="440" y="90" width="290" height="34" rx="10" fill="var(--foreground)" />
      <text x="585" y="113" textAnchor="middle" className="fill-white text-[12px] font-semibold">note_chunks</text>

      {[
        ["note_id", "uuid FK → notes.id"],
        ["idx", "int · PK w/ note_id"],
        ["start_ms / end_ms", "int"],
        ["r2_key", "text"],
        ["transcript", "text"],
        ["status", "text"],
      ].map(([k, v], i) => (
        <g key={k}>
          <text x="456" y={146 + i * 24} className="fill-[var(--foreground)] text-[11px]">{k}</text>
          <text x="716" y={146 + i * 24} textAnchor="end" className={SUB}>{v}</text>
        </g>
      ))}

      <path d="M360,190 L438,190" className={ARROW} strokeWidth="1.5" fill="none" markerEnd="url(#sc-arrow)" />
      <text x="365" y="182" className={SUB}>1 → many (only for segmented files)</text>

      {/* summary jsonb shape callout */}
      <rect x="30" y="365" width="700" height="45" rx="8" className={BOX} strokeWidth="1" strokeDasharray="3 3" />
      <text x="46" y="384" className="fill-[var(--foreground)] text-[11px] font-medium">notes.summary (jsonb)</text>
      <text x="46" y="400" className={SUB}>
        {"{ title, tldr, key_points[], action_items[], open_questions[], unclear_segments[] }"}
      </text>
    </svg>
  );
}

export function RetryFlowDiagram() {
  return (
    <svg viewBox="0 0 760 230" className="w-full" role="img" aria-label="Retry semantics by failed stage">
      <defs>
        <Arrowhead id="rt-arrow" color="var(--error)" />
        <Arrowhead id="rt-arrow-m" />
      </defs>

      <rect x="20" y="90" width="160" height="50" rx="8" className={BOX} strokeWidth="1.5" stroke="var(--error)" />
      <text x="100" y="120" textAnchor="middle" className="fill-[var(--error)] text-[11px] font-semibold">status = failed</text>

      <path d="M180,105 L280,60" className={ARROW} strokeWidth="1.5" fill="none" markerEnd="url(#rt-arrow-m)" />
      <path d="M180,135 L280,180" className={ARROW} strokeWidth="1.5" fill="none" markerEnd="url(#rt-arrow-m)" />

      <rect x="285" y="30" width="220" height="60" rx="8" className={BOX} strokeWidth="1.5" />
      <text x="395" y="53" textAnchor="middle" className={LABEL}>failed_stage = transcribe</text>
      <text x="395" y="70" textAnchor="middle" className={SUB}>resume from first incomplete chunk</text>
      <text x="395" y="83" textAnchor="middle" className={SUB}>completed chunks kept</text>

      <rect x="285" y="150" width="220" height="60" rx="8" className={BOX} strokeWidth="1.5" />
      <text x="395" y="173" textAnchor="middle" className={LABEL}>failed_stage = summarize</text>
      <text x="395" y="190" textAnchor="middle" className={SUB}>re-enqueue summarize only</text>
      <text x="395" y="203" textAnchor="middle" className={SUB}>transcript preserved</text>

      <path d="M505,60 L560,60" className={ARROW} strokeWidth="1.5" fill="none" markerEnd="url(#rt-arrow-m)" />
      <path d="M505,180 L560,180" className={ARROW} strokeWidth="1.5" fill="none" markerEnd="url(#rt-arrow-m)" />

      <rect x="565" y="30" width="175" height="60" rx="8" className={BOX} strokeWidth="1.5" stroke="var(--primary)" />
      <text x="652" y="53" textAnchor="middle" className={LABEL}>ASR only</text>
      <text x="652" y="70" textAnchor="middle" className={SUB}>chunk re-transcribed</text>

      <rect x="565" y="150" width="175" height="60" rx="8" className={BOX} strokeWidth="1.5" stroke="var(--primary)" />
      <text x="652" y="173" textAnchor="middle" className={LABEL}>LLM only</text>
      <text x="652" y="190" textAnchor="middle" className={SUB}>ASR never re-invoked</text>

      <text x="20" y="20" className={SUB}>attempt_count caps automatic retries at 2, exponential backoff</text>
    </svg>
  );
}
