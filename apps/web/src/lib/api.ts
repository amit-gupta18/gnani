import type { NoteListItem, NoteResponse, PresignResponse } from "@gnani/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function presignUpload(
  filename: string,
  contentType: string,
  sizeBytes: number
): Promise<PresignResponse> {
  return apiFetch<PresignResponse>("/uploads/presign", {
    method: "POST",
    body: JSON.stringify({ filename, contentType, sizeBytes }),
  });
}

export function uploadToR2(
  uploadUrl: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Upload interrupted or network error"));
    xhr.send(file);
  });
}

export async function createNote(
  filename: string,
  r2Key: string,
  durationSeconds?: number
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/notes", {
    method: "POST",
    body: JSON.stringify({ filename, r2Key, durationSeconds }),
  });
}

export async function listNotes(): Promise<{ notes: NoteListItem[] }> {
  return apiFetch<{ notes: NoteListItem[] }>("/notes");
}

export async function getNote(id: string): Promise<{ note: NoteResponse }> {
  return apiFetch<{ note: NoteResponse }>(`/notes/${id}`);
}

export async function retryNote(id: string): Promise<{ note: NoteResponse }> {
  return apiFetch<{ note: NoteResponse }>(`/notes/${id}/retry`, {
    method: "POST",
  });
}

export function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(audio.src);
      resolve(Math.round(audio.duration));
    };
    audio.onerror = () => {
      URL.revokeObjectURL(audio.src);
      reject(new Error("Could not read audio duration"));
    };
    audio.src = URL.createObjectURL(file);
  });
}
