import { Router } from "express";
import { z } from "zod";
import { isAudioMimeType } from "@gnani/shared";
import { createPresignedPutUrl } from "../services/r2.js";

const presignSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

export const uploadsRouter = Router();

uploadsRouter.post("/presign", async (req, res) => {
  try {
    const parsed = presignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const { filename, contentType, sizeBytes } = parsed.data;
    const maxBytes = Number(process.env.MAX_UPLOAD_BYTES ?? 52_428_800);

    if (!isAudioMimeType(contentType)) {
      res.status(400).json({
        error: `Unsupported file type: ${contentType}. Please upload an audio file (MP3, WAV, OGG, FLAC, AAC, M4A).`,
      });
      return;
    }

    if (sizeBytes === 0) {
      res.status(400).json({ error: "File is empty. Please select a non-zero-byte audio file." });
      return;
    }

    if (sizeBytes > maxBytes) {
      res.status(400).json({
        error: `File exceeds maximum size of ${Math.round(maxBytes / 1024 / 1024)}MB.`,
      });
      return;
    }

    const result = await createPresignedPutUrl(filename, contentType);
    res.json(result);
  } catch (err) {
    console.error("Presign error:", err);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});
