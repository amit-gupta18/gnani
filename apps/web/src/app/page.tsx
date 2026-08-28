"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { isAudioMimeType } from "@gnani/shared";
import {
  presignUpload,
  uploadToR2,
  createNote,
  getAudioDuration,
} from "@/lib/api";

const MAX_BYTES = 52_428_800;

type UploadState = "idle" | "presigning" | "uploading" | "registering" | "done" | "error";

export default function HomePage() {
  const router = useRouter();
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setProgress(0);

      if (!isAudioMimeType(file.type) && !file.name.match(/\.(mp3|wav|ogg|flac|aac|m4a|webm)$/i)) {
        setError("Please select an audio file (MP3, WAV, OGG, FLAC, AAC, M4A).");
        setState("error");
        return;
      }

      if (file.size === 0) {
        setError("File is empty. Please select a non-zero-byte audio file.");
        setState("error");
        return;
      }

      if (file.size > MAX_BYTES) {
        setError(`File exceeds maximum size of ${Math.round(MAX_BYTES / 1024 / 1024)}MB.`);
        setState("error");
        return;
      }

      try {
        setState("presigning");
        const { uploadUrl, r2Key } = await presignUpload(
          file.name,
          file.type || "audio/mpeg",
          file.size
        );

        setState("uploading");
        await uploadToR2(uploadUrl, file, setProgress);

        setState("registering");
        let durationSeconds: number | undefined;
        try {
          durationSeconds = await getAudioDuration(file);
        } catch {
          // duration is optional
        }

        const { id } = await createNote(file.name, r2Key, durationSeconds);
        setState("done");
        router.push(`/notes/${id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setState("error");
      }
    },
    [router]
  );

  const handleTestSample = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/sample-audio.mp3");
      const blob = await res.blob();
      const file = new File([blob], "sample-audio.mp3", { type: "audio/mpeg" });
      await handleFile(file);
    } catch {
      setError("Couldn't load the sample audio file.");
      setState("error");
    }
  }, [handleFile]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Upload Audio</h1>
      <p className="mb-6 text-[var(--muted)]">
        Upload a 2+ minute audio file to get a transcript and structured summary.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
          dragOver
            ? "border-[var(--primary)] bg-blue-50"
            : "border-[var(--border)] bg-white"
        }`}
      >
        <input
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.flac,.aac,.m4a"
          className="hidden"
          id="file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          disabled={state !== "idle" && state !== "error"}
        />
        <label
          htmlFor="file-input"
          className="cursor-pointer text-[var(--primary)] hover:underline"
        >
          Choose an audio file
        </label>
        <p className="mt-2 text-sm text-[var(--muted)]">or drag and drop here</p>
        <p className="mt-4 text-xs text-[var(--muted)]">
          MP3, WAV, OGG, FLAC, AAC, M4A — up to 50MB
        </p>
      </div>

      <div className="mt-4 flex items-center justify-center gap-3 text-sm">
        <span className="text-[var(--muted)]">No file handy?</span>
        <button
          type="button"
          onClick={handleTestSample}
          disabled={state !== "idle" && state !== "error"}
          className="font-medium text-[var(--primary)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          Test with a 20s sample clip
        </button>
      </div>

      {state === "uploading" && (
        <div className="mt-6">
          <div className="mb-2 flex justify-between text-sm">
            <span>Uploading...</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {(state === "presigning" || state === "registering") && (
        <p className="mt-6 text-sm text-[var(--muted)]">
          {state === "presigning" ? "Preparing upload..." : "Registering note..."}
        </p>
      )}

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-[var(--error)]">
          {error}
        </div>
      )}
    </div>
  );
}
