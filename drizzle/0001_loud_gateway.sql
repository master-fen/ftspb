ALTER TABLE "document" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "status" "status_enum";--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "in_library" boolean;