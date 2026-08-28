import "./env.js";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { markStalledNotes } from "@gnani/db";
import { sessionMiddleware } from "./middleware/session.js";
import { uploadsRouter } from "./routes/uploads.js";
import { notesRouter } from "./routes/notes.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const webUrl = process.env.WEB_URL ?? "http://localhost:3000";

app.use(
  cors({
    origin: webUrl,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser(process.env.SESSION_COOKIE_SECRET));
app.use(sessionMiddleware);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/uploads", uploadsRouter);
app.use("/notes", notesRouter);

const stallInterval = Number(process.env.STALL_SWEEP_INTERVAL_MS ?? 300_000);
const stallThreshold = Number(process.env.STALL_THRESHOLD_MS ?? 600_000);

setInterval(async () => {
  try {
    const count = await markStalledNotes(stallThreshold);
    if (count > 0) {
      console.log(`Marked ${count} stalled note(s) as failed`);
    }
  } catch (err) {
    console.error("Stall sweep error:", err);
  }
}, stallInterval);

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
