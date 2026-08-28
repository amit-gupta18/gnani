"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import type { NoteResponse } from "@gnani/shared";
import { getNote, retryNote } from "@/lib/api";
import { StatusStepper } from "@/components/StatusStepper";
import { SummaryView } from "@/components/SummaryView";
import { StatusBadge } from "@/components/StatusStepper";

const TERMINAL = new Set(["done", "failed"]);

export default function NoteDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [note, setNote] = useState<NoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const fetchNote = useCallback(async () => {
    try {
      const data = await getNote(id);
      setNote(data.note);
      setError(null);
      return data.note;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load note");
      return null;
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    let pollCount = 0;
    let timeoutId: ReturnType<typeof setTimeout>;

    async function poll() {
      const n = await fetchNote();
      if (cancelled || !n || TERMINAL.has(n.status)) return;

      pollCount++;
      const delay = pollCount > 30 ? 5000 : 2000;
      timeoutId = setTimeout(poll, delay);
    }

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [fetchNote]);

  async function handleRetry() {
    setRetrying(true);
    try {
      const data = await retryNote(id);
      setNote(data.note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  }

  if (!note && !error) {
    return <p className="text-[var(--muted)]">Loading note...</p>;
  }

  if (error && !note) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-[var(--error)]">
        {error}
      </div>
    );
  }

  if (!note) return null;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{note.filename}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {new Date(note.createdAt).toLocaleString()}
          </p>
        </div>
        <StatusBadge status={note.status} />
      </div>

      <StatusStepper status={note.status} chunkProgress={note.chunkProgress} />

      {note.status === "failed" && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-[var(--error)]">{note.errorMessage}</p>
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="mt-3 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            {retrying ? "Retrying..." : "Retry"}
          </button>
        </div>
      )}

      {!TERMINAL.has(note.status) && (
        <p className="mb-6 text-sm text-[var(--muted)]">Processing your audio note...</p>
      )}

      {note.transcript && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Transcript</h2>
          <div className="rounded-xl border border-[var(--border)] bg-white p-4 text-sm leading-relaxed whitespace-pre-wrap">
            {note.transcript}
          </div>
        </section>
      )}

      {note.summary && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Summary</h2>
          <div className="rounded-xl border border-[var(--border)] bg-white p-4">
            <SummaryView summary={note.summary} modelUsed={note.modelUsed} />
          </div>
        </section>
      )}
    </div>
  );
}
