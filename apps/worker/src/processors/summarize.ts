import {
  getNoteById,
  claimNoteForSummarization,
  setNoteDone,
  setNoteFailed,
} from "@gnani/db";
import { summarizeTranscript } from "../services/llm.js";

export async function processSummarize(noteId: string): Promise<void> {
  const note = await getNoteById(noteId);
  if (!note) {
    throw new Error(`Note ${noteId} not found`);
  }

  if (!note.transcript) {
    await setNoteFailed(noteId, "summarize", "No transcript available to summarize");
    throw new Error("No transcript available");
  }

  const claimed = await claimNoteForSummarization(noteId);
  if (!claimed) {
    console.log(`Note ${noteId} summarize already claimed, skipping`);
    return;
  }

  try {
    const { summary, modelUsed } = await summarizeTranscript(note.transcript);
    await setNoteDone(noteId, summary, modelUsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setNoteFailed(noteId, "summarize", msg);
    throw err;
  }
}
