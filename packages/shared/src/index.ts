import { z } from "zod";

export const NOTE_STATUSES = [
  "uploaded",
  "transcribing",
  "summarizing",
  "done",
  "failed",
] as const;

export type NoteStatus = (typeof NOTE_STATUSES)[number];

export const FAILED_STAGES = ["transcribe", "summarize"] as const;
export type FailedStage = (typeof FAILED_STAGES)[number];

export const CHUNK_STATUSES = ["pending", "processing", "done", "failed"] as const;
export type ChunkStatus = (typeof CHUNK_STATUSES)[number];

export const summarySchema = z.object({
  title: z.string(),
  tldr: z.string(),
  key_points: z.array(z.string()),
  action_items: z.array(
    z.object({
      text: z.string(),
      owner: z.string().nullable(),
    })
  ),
  open_questions: z.array(z.string()),
  unclear_segments: z.array(z.string()),
});

export type Summary = z.infer<typeof summarySchema>;

export const AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/ogg",
  "audio/flac",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/webm",
] as const;

export const AUDIO_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".ogg",
  ".flac",
  ".aac",
  ".m4a",
  ".webm",
] as const;

export function isAudioMimeType(mime: string): boolean {
  if (mime.startsWith("audio/")) return true;
  return (AUDIO_MIME_TYPES as readonly string[]).includes(mime);
}

export interface NoteResponse {
  id: string;
  sessionId: string;
  filename: string;
  r2Key: string;
  durationSeconds: number | null;
  status: NoteStatus;
  failedStage: FailedStage | null;
  errorMessage: string | null;
  transcript: string | null;
  summary: Summary | null;
  modelUsed: string | null;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  chunkProgress?: {
    done: number;
    total: number;
  };
}

export interface NoteListItem {
  id: string;
  filename: string;
  status: NoteStatus;
  durationSeconds: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PresignRequest {
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface PresignResponse {
  uploadUrl: string;
  r2Key: string;
  expiresAt: string;
}

export interface CreateNoteRequest {
  filename: string;
  r2Key: string;
  durationSeconds?: number;
}

export interface TranscribeJobData {
  noteId: string;
}

export interface SummarizeJobData {
  noteId: string;
}

export const SUMMARY_SYSTEM_PROMPT = `You are summarizing a transcript produced by automatic speech recognition.
The transcript may contain recognition errors, especially on proper nouns,
numbers, and code-switched speech. Do not invent detail to smooth over a
garbled passage — if a segment is unintelligible, say so.

Return JSON only, no prose, no markdown fences:
{
  "title":        string,
  "tldr":         string,
  "key_points":   string[],
  "action_items": [ { "text": string, "owner": string|null } ],
  "open_questions": string[],
  "unclear_segments": string[]
}

If the transcript contains no action items, return an empty array.
Do not fabricate owners.`;
