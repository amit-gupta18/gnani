import type { NoteStatus } from "@gnani/shared";

const STATUS_LABELS: Record<NoteStatus, string> = {
  uploaded: "Uploaded",
  transcribing: "Transcribing",
  summarizing: "Summarizing",
  done: "Done",
  failed: "Failed",
};

const STATUS_COLORS: Record<NoteStatus, string> = {
  uploaded: "bg-gray-100 text-gray-700",
  transcribing: "bg-blue-100 text-blue-700",
  summarizing: "bg-yellow-100 text-yellow-800",
  done: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: NoteStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

const STEPS: NoteStatus[] = ["uploaded", "transcribing", "summarizing", "done"];

export function StatusStepper({
  status,
  chunkProgress,
}: {
  status: NoteStatus;
  chunkProgress?: { done: number; total: number };
}) {
  if (status === "failed") return null;

  const currentIdx = STEPS.indexOf(status as (typeof STEPS)[number]);

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2">
        {STEPS.map((step, i) => (
          <div key={step} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                i <= currentIdx
                  ? "bg-[var(--primary)] text-white"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {i + 1}
            </div>
            <span
              className={`text-sm ${i <= currentIdx ? "font-medium" : "text-[var(--muted)]"}`}
            >
              {STATUS_LABELS[step]}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={`mx-2 h-0.5 flex-1 ${i < currentIdx ? "bg-[var(--primary)]" : "bg-gray-200"}`}
              />
            )}
          </div>
        ))}
      </div>
      {status === "transcribing" && chunkProgress && chunkProgress.total > 0 && (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Transcribing — {chunkProgress.done} of {chunkProgress.total} segments
        </p>
      )}
    </div>
  );
}
