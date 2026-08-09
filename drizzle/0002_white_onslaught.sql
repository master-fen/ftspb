ALTER TABLE "document" ALTER COLUMN "file_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "document" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ALTER COLUMN "in_library" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "document" ALTER COLUMN "in_library" SET NOT NULL;