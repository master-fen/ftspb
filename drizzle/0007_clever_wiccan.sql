CREATE TYPE "date_precision_enum" AS ENUM('day', 'month', 'quarter', 'half_year', 'year');--> statement-breakpoint
CREATE TYPE "event_type_enum" AS ENUM('general_meeting', 'board', 'audit', 'other');--> statement-breakpoint
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"type" "event_type_enum" NOT NULL,
	"starts_on" date NOT NULL,
	"starts_time" time,
	"date_precision" date_precision_enum DEFAULT 'day' NOT NULL,
	"location" text,
	"description" text,
	"status" "status_enum" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "event_starts_time_precision_check" CHECK (date_precision = 'day' or starts_time is null)
);
--> statement-breakpoint
CREATE TABLE "event_document" (
	"event_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "event_document_event_id_document_id_pk" PRIMARY KEY("event_id","document_id")
);
--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "event_document" ADD CONSTRAINT "event_document_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_document" ADD CONSTRAINT "event_document_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_slug_active_idx" ON "event" USING btree ("slug") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "event_status_starts_on_idx" ON "event" USING btree ("status","starts_on");--> statement-breakpoint
ALTER TABLE "news" ADD CONSTRAINT "news_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "news_event_id_idx" ON "news" USING btree ("event_id");