import { execFile } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import { basename } from "path";

const execFileAsync = promisify(execFile);

export async function probeDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  return parseFloat(stdout.trim());
}

export async function normalizeAudio(inputPath: string, outputPath: string): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    outputPath,
  ]);
}

export async function extractSegment(
  inputPath: string,
  outputPath: string,
  startSec: number,
  durationSec: number
): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-y",
    "-ss",
    String(startSec),
    "-i",
    inputPath,
    "-t",
    String(durationSec),
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    outputPath,
  ]);
}

interface SilencePoint {
  time: number;
}

export async function detectSilencePoints(filePath: string): Promise<SilencePoint[]> {
  try {
    const { stderr } = await execFileAsync("ffmpeg", [
      "-i",
      filePath,
      "-af",
      "silencedetect=noise=-30dB:d=0.5",
      "-f",
      "null",
      "-",
    ]);
    const points: SilencePoint[] = [];
    const regex = /silence_end: ([\d.]+)/g;
    let match;
    while ((match = regex.exec(stderr)) !== null) {
      points.push({ time: parseFloat(match[1]) });
    }
    return points;
  } catch (err: unknown) {
    const execErr = err as { stderr?: string };
    const stderr = execErr.stderr ?? "";
    const points: SilencePoint[] = [];
    const regex = /silence_end: ([\d.]+)/g;
    let match;
    while ((match = regex.exec(stderr)) !== null) {
      points.push({ time: parseFloat(match[1]) });
    }
    return points;
  }
}

export function planSegments(
  totalDurationSec: number,
  targetSec: number,
  overlapSec: number,
  silencePoints: SilencePoint[]
): Array<{ startSec: number; endSec: number }> {
  const segments: Array<{ startSec: number; endSec: number }> = [];
  let cursor = 0;

  while (cursor < totalDurationSec) {
    const idealEnd = Math.min(cursor + targetSec, totalDurationSec);
    let cutPoint = idealEnd;

    if (idealEnd < totalDurationSec) {
      const windowStart = cursor + targetSec * 0.7;
      const windowEnd = idealEnd;
      const candidates = silencePoints
        .map((p) => p.time)
        .filter((t) => t >= windowStart && t <= windowEnd);
      if (candidates.length > 0) {
        cutPoint = candidates[candidates.length - 1];
      }
    }

    segments.push({ startSec: cursor, endSec: cutPoint });
    if (cutPoint >= totalDurationSec) break;
    cursor = Math.max(0, cutPoint - overlapSec);
  }

  return segments;
}

export function stitchTranscripts(chunks: string[], overlapSec: number): string {
  if (chunks.length === 0) return "";
  if (chunks.length === 1) return chunks[0];

  let result = chunks[0];
  for (let i = 1; i < chunks.length; i++) {
    const prev = result.split(/\s+/);
    const curr = chunks[i].split(/\s+/);
    const overlapWords = Math.max(3, Math.floor(overlapSec * 2));
    const tail = prev.slice(-overlapWords).join(" ").toLowerCase();
    let skip = 0;
    for (let j = 0; j < Math.min(overlapWords, curr.length); j++) {
      const candidate = curr.slice(0, j + 1).join(" ").toLowerCase();
      if (tail.endsWith(candidate) || candidate === tail) {
        skip = j + 1;
      }
    }
    result = result + " " + curr.slice(skip).join(" ");
  }
  return result.trim();
}

// Proactive pacing, not just reactive retry-on-429: concurrent chunks would
// otherwise all fire at once regardless of TRANSCRIBE_CONCURRENCY, which is
// exactly the burst shape that trips Gnani's rate limit. This serializes
// call *starts* to at least GNANI_MIN_INTERVAL_MS apart, no matter how many
// chunks are in flight, by chaining every call onto a shared promise.
const GNANI_MIN_INTERVAL_MS = Number(process.env.GNANI_MIN_INTERVAL_MS ?? 1500);
let gnaniGate: Promise<void> = Promise.resolve();

function throttleGnaniCall(): Promise<void> {
  const wait = gnaniGate.then(
    () => new Promise<void>((resolve) => setTimeout(resolve, GNANI_MIN_INTERVAL_MS))
  );
  gnaniGate = wait;
  return wait;
}

async function transcribeWithGnaniOnce(
  filePath: string
): Promise<{ transcript: string; raw: unknown; status?: number }> {
  const apiKey = process.env.GNANI_API_KEY;
  if (!apiKey) throw new Error("GNANI_API_KEY is not set");

  const languageCode = process.env.GNANI_LANGUAGE_CODE ?? "en-IN";
  const timeoutMs = Number(process.env.GNANI_ASR_TIMEOUT_MS ?? 90_000);

  const fileBuffer = await readFile(filePath);
  const form = new FormData();
  const blob = new Blob([fileBuffer], { type: "audio/wav" });
  form.append("audio_file", blob, basename(filePath));
  form.append("language_code", languageCode);
  form.append("format", "transcribe");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.vachana.ai/stt/v3", {
      method: "POST",
      headers: {
        "X-API-Key-ID": apiKey,
      },
      body: form,
      signal: controller.signal,
    });

    const body = (await response.json()) as {
      success?: boolean;
      transcript?: string;
      error?: { message?: string };
    };

    if (!response.ok || !body.success) {
      const msg =
        body.error?.message ??
        `Gnani ASR returned status ${response.status}`;
      // Log the full response, not just the message we surface to the note:
      // "duration exceeds maximum" from Gnani has, at least once, disagreed
      // with our own ffprobe measurement of the exact same file — the raw
      // body is what lets that get root-caused instead of re-guessed.
      console.error(`Gnani ASR error (status ${response.status}) for ${basename(filePath)}:`, JSON.stringify(body));
      const err = new Error(msg) as Error & { status?: number };
      err.status = response.status;
      throw err;
    }

    return { transcript: body.transcript ?? "", raw: body };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`ASR timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Gnani rate-limits per-key request bursts (429). A note with several
// chunks in flight at once is exactly the shape that triggers it, so a
// short backoff-and-retry here absorbs a transient 429 instead of failing
// the whole note over what is really just "try again in a second."
export async function transcribeWithGnani(
  filePath: string,
  maxRetries = 3
): Promise<{ transcript: string; raw: unknown }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await throttleGnaniCall();
      return await transcribeWithGnaniOnce(filePath);
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number }).status;
      if (status !== 429 || attempt === maxRetries) throw err;
      const delayMs = 1000 * 2 ** attempt + Math.random() * 250;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}
