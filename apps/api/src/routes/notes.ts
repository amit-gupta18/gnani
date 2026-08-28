import { Router } from "express";
import { z } from "zod";
import type { NoteResponse, NoteListItem, Summary } from "@gnani/shared";
import {
  createNote,
  listNotesBySession,
  getNoteByIdForSession,
  getNoteById,
  claimNoteForTranscription,
  claimNoteForSummarization,
  getChunkProgress,
} from "@gnani/db";
import { enqueueTranscribe, enqueueSummarize } from "@gnani/queue";

const createNoteSchema = z.object({
  filename: z.string().min(1),
  r2Key: z.string().min(1),
  durationSeconds: z.number().int().positive().optional(),
});

function toNoteResponse(
  note: Awaited<ReturnType<typeof getNoteById>>,
  chunkProgress?: { done: number; total: number } | null
): NoteResponse | null {
  if (!note) return null;
  return {
    id: note.id,
    sessionId: note.sessionId,
    filename: note.filename,
    r2Key: note.r2Key,
    durationSeconds: note.durationSeconds,
    status: note.status,
    failedStage: note.failedStage as NoteResponse["failedStage"],
    errorMessage: note.errorMessage,
    transcript: note.transcript,
    summary: note.summary as Summary | null,
    modelUsed: note.modelUsed,
    attemptCount: note.attemptCount,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    ...(chunkProgress ? { chunkProgress } : {}),
  };
}

export const notesRouter = Router();

notesRouter.get("/", async (req, res) => {
  try {
    const notes = await listNotesBySession(req.sessionId);
    const items: NoteListItem[] = notes.map((n) => ({
      id: n.id,
      filename: n.filename,
      status: n.status,
      durationSeconds: n.durationSeconds,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
    }));
    res.json({ notes: items });
  } catch (err) {
    console.error("List notes error:", err);
    res.status(500).json({ error: "Failed to list notes" });
  }
});

notesRouter.get("/:id", async (req, res) => {
  try {
    const note = await getNoteByIdForSession(req.params.id, req.sessionId);
    if (!note) {
      res.status(404).json({ error: "Note not found" });
      return;
    }
    const chunkProgress =
      note.status === "transcribing" ? await getChunkProgress(note.id) : null;
    res.json({ note: toNoteResponse(note, chunkProgress) });
  } catch (err) {
    console.error("Get note error:", err);
    res.status(500).json({ error: "Failed to get note" });
  }
});

notesRouter.post("/", async (req, res) => {
  try {
    const parsed = createNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const { filename, r2Key, durationSeconds } = parsed.data;
    const note = await createNote({
      sessionId: req.sessionId,
      filename,
      r2Key,
      durationSeconds,
    });

    const claimed = await claimNoteForTranscription(note.id);
    if (claimed) {
      await enqueueTranscribe(note.id);
    }

    res.status(201).json({ id: note.id });
  } catch (err) {
    console.error("Create note error:", err);
    res.status(500).json({ error: "Failed to create note" });
  }
});

notesRouter.post("/:id/retry", async (req, res) => {
  try {
    const note = await getNoteByIdForSession(req.params.id, req.sessionId);
    if (!note) {
      res.status(404).json({ error: "Note not found" });
      return;
    }

    if (note.status !== "failed") {
      res.status(400).json({ error: "Only failed notes can be retried" });
      return;
    }

    if (note.failedStage === "summarize" && note.transcript) {
      const claimed = await claimNoteForSummarization(note.id);
      if (claimed) {
        await enqueueSummarize(note.id);
      }
    } else {
      const claimed = await claimNoteForTranscription(note.id);
      if (claimed) {
        await enqueueTranscribe(note.id);
      }
    }

    const updated = await getNoteById(note.id);
    res.json({ note: toNoteResponse(updated) });
  } catch (err) {
    console.error("Retry note error:", err);
    res.status(500).json({ error: "Failed to retry note" });
  }
});
