import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { FailedStage, NoteStatus, Summary } from "@gnani/shared";
import { getDb } from "./client.js";
import { noteChunks, notes, type NewNote, type NewNoteChunk } from "./schema.js";

export async function createNote(data: {
  sessionId: string;
  filename: string;
  r2Key: string;
  durationSeconds?: number;
}) {
  const db = getDb();
  const [note] = await db
    .insert(notes)
    .values({
      sessionId: data.sessionId,
      filename: data.filename,
      r2Key: data.r2Key,
      durationSeconds: data.durationSeconds ?? null,
      status: "uploaded",
    })
    .returning();
  return note;
}

export async function listNotesBySession(sessionId: string) {
  const db = getDb();
  return db
    .select({
      id: notes.id,
      filename: notes.filename,
      status: notes.status,
      durationSeconds: notes.durationSeconds,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(eq(notes.sessionId, sessionId))
    .orderBy(desc(notes.createdAt));
}

export async function getNoteById(id: string) {
  const db = getDb();
  const [note] = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
  return note ?? null;
}

export async function getNoteByIdForSession(id: string, sessionId: string) {
  const db = getDb();
  const [note] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.sessionId, sessionId)))
    .limit(1);
  return note ?? null;
}

export async function claimNoteForTranscription(noteId: string) {
  const db = getDb();
  const [note] = await db
    .update(notes)
    .set({
      status: "transcribing",
      failedStage: null,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(and(eq(notes.id, noteId), inArray(notes.status, ["uploaded", "failed"])))
    .returning();
  return note ?? null;
}

export async function claimNoteForSummarization(noteId: string) {
  const db = getDb();
  const [note] = await db
    .update(notes)
    .set({
      status: "summarizing",
      failedStage: null,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(notes.id, noteId),
        inArray(notes.status, ["transcribing", "summarizing", "failed"])
      )
    )
    .returning();
  return note ?? null;
}

export async function updateNoteStatus(noteId: string, status: NoteStatus) {
  const db = getDb();
  const [note] = await db
    .update(notes)
    .set({ status, updatedAt: new Date() })
    .where(eq(notes.id, noteId))
    .returning();
  return note ?? null;
}

export async function setNoteTranscript(
  noteId: string,
  transcript: string,
  asrRaw?: unknown
) {
  const db = getDb();
  const [note] = await db
    .update(notes)
    .set({
      transcript,
      asrRaw: asrRaw ?? null,
      status: "summarizing",
      updatedAt: new Date(),
    })
    .where(eq(notes.id, noteId))
    .returning();
  return note ?? null;
}

export async function setNoteDone(noteId: string, summary: Summary, modelUsed: string) {
  const db = getDb();
  const [note] = await db
    .update(notes)
    .set({
      summary,
      modelUsed,
      status: "done",
      failedStage: null,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(notes.id, noteId))
    .returning();
  return note ?? null;
}

export async function setNoteFailed(
  noteId: string,
  failedStage: FailedStage,
  errorMessage: string
) {
  const db = getDb();
  const [note] = await db
    .update(notes)
    .set({
      status: "failed",
      failedStage,
      errorMessage,
      attemptCount: sql`${notes.attemptCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(notes.id, noteId))
    .returning();
  return note ?? null;
}

export async function incrementAttemptCount(noteId: string) {
  const db = getDb();
  await db
    .update(notes)
    .set({
      attemptCount: sql`${notes.attemptCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(notes.id, noteId));
}

export async function upsertChunks(chunks: NewNoteChunk[]) {
  if (chunks.length === 0) return;
  const db = getDb();
  await db.delete(noteChunks).where(eq(noteChunks.noteId, chunks[0].noteId));
  await db.insert(noteChunks).values(chunks);
}

export async function getChunksForNote(noteId: string) {
  const db = getDb();
  return db
    .select()
    .from(noteChunks)
    .where(eq(noteChunks.noteId, noteId))
    .orderBy(noteChunks.idx);
}

export async function updateChunkStatus(
  noteId: string,
  idx: number,
  status: string,
  transcript?: string
) {
  const db = getDb();
  await db
    .update(noteChunks)
    .set({
      status,
      ...(transcript !== undefined ? { transcript } : {}),
    })
    .where(and(eq(noteChunks.noteId, noteId), eq(noteChunks.idx, idx)));
}

export async function getChunkProgress(noteId: string) {
  const chunks = await getChunksForNote(noteId);
  if (chunks.length === 0) return null;
  const done = chunks.filter((c) => c.status === "done").length;
  return { done, total: chunks.length };
}

export async function getStalledNotes(thresholdMs: number) {
  const db = getDb();
  const cutoff = new Date(Date.now() - thresholdMs);
  return db
    .select()
    .from(notes)
    .where(
      and(
        inArray(notes.status, ["uploaded", "transcribing", "summarizing"]),
        sql`${notes.updatedAt} < ${cutoff}`
      )
    );
}

export async function markStalledNotes(thresholdMs: number) {
  const stalled = await getStalledNotes(thresholdMs);
  for (const note of stalled) {
  const stage: FailedStage =
      note.status === "summarizing" ? "summarize" : "transcribe";
    await setNoteFailed(note.id, stage, "processing stalled");
  }
  return stalled.length;
}
