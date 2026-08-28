import { Worker } from "bullmq";
import type { SummarizeJobData, TranscribeJobData } from "@gnani/shared";
import {
  getRedisConnection,
  TRANSCRIBE_QUEUE,
  SUMMARIZE_QUEUE,
} from "@gnani/queue";
import { processTranscribe } from "./processors/transcribe.js";
import { processSummarize } from "./processors/summarize.js";

export function startWorkers() {
  const transcribeConcurrency = Number(process.env.TRANSCRIBE_CONCURRENCY ?? 3);

  const transcribeWorker = new Worker<TranscribeJobData>(
    TRANSCRIBE_QUEUE,
    async (job) => {
      console.log(`Processing transcribe job for note ${job.data.noteId}`);
      await processTranscribe(job.data.noteId);
    },
    {
      connection: getRedisConnection(),
      concurrency: transcribeConcurrency,
    }
  );

  const summarizeWorker = new Worker<SummarizeJobData>(
    SUMMARIZE_QUEUE,
    async (job) => {
      console.log(`Processing summarize job for note ${job.data.noteId}`);
      await processSummarize(job.data.noteId);
    },
    {
      connection: getRedisConnection(),
      concurrency: 2,
    }
  );

  transcribeWorker.on("completed", (job) => {
    console.log(`Transcribe job ${job.id} completed`);
  });

  transcribeWorker.on("failed", (job, err) => {
    console.error(`Transcribe job ${job?.id} failed:`, err.message);
  });

  summarizeWorker.on("completed", (job) => {
    console.log(`Summarize job ${job.id} completed`);
  });

  summarizeWorker.on("failed", (job, err) => {
    console.error(`Summarize job ${job?.id} failed:`, err.message);
  });

  console.log("Worker started, listening for transcribe and summarize jobs");

  return { transcribeWorker, summarizeWorker };
}
