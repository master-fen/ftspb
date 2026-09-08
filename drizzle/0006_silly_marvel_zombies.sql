ALTER TABLE "document" ADD COLUMN "slug" text;--> statement-breakpoint
CREATE UNIQUE INDEX "document_slug_active_idx" ON "document" USING btree ("slug") WHERE deleted_at is null;