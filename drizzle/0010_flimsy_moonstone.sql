ALTER TABLE "news" ADD COLUMN "preview_token" text;--> statement-breakpoint
ALTER TABLE "news" ADD COLUMN "preview_token_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "news_preview_token_idx" ON "news" USING btree ("preview_token") WHERE preview_token is not null;