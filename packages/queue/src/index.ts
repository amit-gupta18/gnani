import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { SummarizeJobData, TranscribeJobData } from "@gnani/shared";

let connection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!connection) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL is not set");
    }
    const redisUrl = url.includes("upstash.io") && url.startsWith("redis://")
      ? url.replace("redis://", "rediss://")
      : url;
    connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      ...(redisUrl.startsWith("rediss://") ? { tls: {} } : {}),
    });
  }
  return connection;
}

export const TRANSCRIBE_QUEUE = "transcribe";
export const SUMMARIZE_QUEUE = "summarize";

let transcribeQueue: Queue<TranscribeJobData> | null = null;
let summarizeQueue: Queue<SummarizeJobData> | null = null;

export function getTranscribeQueue() {
  if (!transcribeQueue) {
    transcribeQueue = new Queue<TranscribeJobData>(TRANSCRIBE_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return transcribeQueue;
}

export function getSummarizeQueue() {
  if (!summarizeQueue) {
    summarizeQueue = new Queue<SummarizeJobData>(SUMMARIZE_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return summarizeQueue;
}

export async function enqueueTranscribe(noteId: string) {
  const queue = getTranscribeQueue();
  await queue.add(TRANSCRIBE_QUEUE, { noteId }, { jobId: noteId });
}

export async function enqueueSummarize(noteId: string) {
  const queue = getSummarizeQueue();
  await queue.add(SUMMARIZE_QUEUE, { noteId }, { jobId: `summarize-${noteId}` });
}

export async function closeQueues() {
  await Promise.all([
    transcribeQueue?.close(),
    summarizeQueue?.close(),
    connection?.quit(),
  ]);
  transcribeQueue = null;
  summarizeQueue = null;
  connection = null;
}
  