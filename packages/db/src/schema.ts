import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  pgEnum,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

export const noteStatusEnum = pgEnum("note_status", [
  "uploaded",
  "transcribing",
  "summarizing",
  "done",
  "failed",
]);

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: text("session_id").notNull(),
    filename: text("filename").notNull(),
    r2Key: text("r2_key").notNull(),
    durationSeconds: integer("duration_seconds"),
    status: noteStatusEnum("status").notNull().default("uploaded"),
    failedStage: text("failed_stage"),
    errorMessage: text("error_message"),
    transcript: text("transcript"),
    summary: jsonb("summary"),
    modelUsed: text("model_used"),
    asrRaw: jsonb("asr_raw"),
    attemptCount: integer("attempt_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notes_session_created_idx").on(table.sessionId, table.createdAt),
    index("notes_status_idx").on(table.status),
  ]
);

export const noteChunks = pgTable(
  "note_chunks",
  {
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    r2Key: text("r2_key").notNull(),
    transcript: text("transcript"),
    status: text("status").notNull().default("pending"),
  },
  (table) => [primaryKey({ columns: [table.noteId, table.idx] })]
);

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type NoteChunk = typeof noteChunks.$inferSelect;
export type NewNoteChunk = typeof noteChunks.$inferInsert;
