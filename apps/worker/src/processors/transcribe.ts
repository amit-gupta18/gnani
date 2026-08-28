import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import pLimit from "p-limit";
import {
  getNoteById,
  claimNoteForTranscription,
  setNoteTranscript,
  setNoteFailed,
  upsertChunks,
  updateChunkStatus,
  getChunksForNote,
} from "@gnani/db";
import { enqueueSummarize } from "@gnani/queue";
import { downloadFromR2 } from "../services/r2.js";
import {
  probeDuration,
  normalizeAudio,
  extractSegment,
  detectSilencePoints,
  planSegments,
  stitchTranscripts,
  transcribeWithGnani,
} from "../services/audio.js";

const GNANI_MAX_SECONDS = 60;
const targetSec = Number(process.env.CHUNK_TARGET_SECONDS ?? 55);
const overlapSec = Number(process.env.CHUNK_OVERLAP_SECONDS ?? 2);
const concurrency = Number(process.env.TRANSCRIBE_CONCURRENCY ?? 3);

export async function processTranscribe(noteId: string): Promise<void> {
  const note = await getNoteById(noteId);
  if (!note) {
    throw new Error(`Note ${noteId} not found`);
  }

  if (note.status === "done" || note.status === "summarizing") {
    return;
  }

  if (note.status === "uploaded" || note.status === "failed") {
    const claimed = await claimNoteForTranscription(noteId);
    if (!claimed) {
      console.log(`Note ${noteId} already claimed, skipping`);
      return;
    }
  } else if (note.status !== "transcribing") {
    return;
  }

  const workDir = await mkdtemp(join(tmpdir(), "gnani-"));
  const ext = note.filename.match(/\.[^.]+$/)?.[0] ?? ".audio";
  const inputPath = join(workDir, `input${ext}`);
  const normalizedPath = join(workDir, "normalized.wav");

  try {
    await downloadFromR2(note.r2Key, inputPath);
    const duration = await probeDuration(inputPath);

    if (duration <= GNANI_MAX_SECONDS) {
      const { transcript, raw } = await transcribeWithGnani(inputPath);
      await setNoteTranscript(noteId, transcript, raw);
      await enqueueSummarize(noteId);
      return;
    }

    await normalizeAudio(inputPath, normalizedPath);
    const silencePoints = await detectSilencePoints(normalizedPath);
    const segments = planSegments(duration, targetSec, overlapSec, silencePoints);

    await upsertChunks(
      segments.map((seg, idx) => ({
        noteId,
        idx,
        startMs: Math.round(seg.startSec * 1000),
        endMs: Math.round(seg.endSec * 1000),
        r2Key: note.r2Key,
        status: "pending",
      }))
    );

    const existingChunks = await getChunksForNote(noteId);
    const limit = pLimit(concurrency);
    const transcripts: string[] = new Array(segments.length).fill("");

    await Promise.all(
      existingChunks.map((chunk) =>
        limit(async () => {
          if (chunk.status === "done" && chunk.transcript) {
            transcripts[chunk.idx] = chunk.transcript;
            return;
          }

          await updateChunkStatus(noteId, chunk.idx, "processing");
          const seg = segments[chunk.idx];
          const segPath = join(workDir, `chunk-${chunk.idx}.wav`);

          try {
            await extractSegment(
              normalizedPath,
              segPath,
              seg.startSec,
              seg.endSec - seg.startSec
            );
            const { transcript } = await transcribeWithGnani(segPath);
            transcripts[chunk.idx] = transcript;
            await updateChunkStatus(noteId, chunk.idx, "done", transcript);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await updateChunkStatus(noteId, chunk.idx, "failed");
            throw new Error(`segment ${chunk.idx + 1} of ${segments.length} failed: ${msg}`);
          }
        })
      )
    );

    const fullTranscript = stitchTranscripts(
      transcripts.filter(Boolean),
      overlapSec
    );
    await setNoteTranscript(noteId, fullTranscript, { segmented: true, chunks: segments.length });
    await enqueueSummarize(noteId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setNoteFailed(noteId, "transcribe", msg);
    throw err;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
