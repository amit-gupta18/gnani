"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NoteListItem } from "@gnani/shared";
import { listNotes } from "@/lib/api";
import { StatusBadge } from "@/components/StatusStepper";

export default function NotesPage() {
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listNotes()
      .then((data) => setNotes(data.notes))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load notes"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-[var(--muted)]">Loading notes...</p>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-[var(--error)]">
        {error}
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Past Notes</h1>

      {notes.length === 0 ? (
        <p className="text-[var(--muted)]">
          No notes yet.{" "}
          <Link href="/" className="text-[var(--primary)] hover:underline">
            Upload audio
          </Link>{" "}
          to get started.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-white">
          {notes.map((note) => (
            <li key={note.id}>
              <Link
                href={`/notes/${note.id}`}
                className="flex items-center justify-between px-4 py-4 hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium">{note.filename}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {new Date(note.createdAt).toLocaleString()}
                    {note.durationSeconds
                      ? ` · ${Math.floor(note.durationSeconds / 60)}m ${note.durationSeconds % 60}s`
                      : ""}
                  </p>
                </div>
                <StatusBadge status={note.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
