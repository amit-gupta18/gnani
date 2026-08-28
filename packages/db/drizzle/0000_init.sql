CREATE TYPE "public"."note_status" AS ENUM('uploaded', 'transcribing', 'summarizing', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "note_chunks" (
	"note_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"r2_key" text NOT NULL,
	"transcript" text,
	"status" text DEFAULT 'pending' NOT NULL,
	CONSTRAINT "note_chunks_note_id_idx_pk" PRIMARY KEY("note_id","idx")
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"filename" text NOT NULL,
	"r2_key" text NOT NULL,
	"duration_seconds" integer,
	"status" "note_status" DEFAULT 'uploaded' NOT NULL,
	"failed_stage" text,
	"error_message" text,
	"transcript" text,
	"summary" jsonb,
	"model_used" text,
	"asr_raw" jsonb,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "note_chunks" ADD CONSTRAINT "note_chunks_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_session_created_idx" ON "notes" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "notes_status_idx" ON "notes" USING btree ("status");
