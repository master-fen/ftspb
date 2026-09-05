CREATE TABLE "federation_person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"role" text NOT NULL,
	"bio" text,
	"phone" text,
	"email" text,
	"photo_s3_key" text,
	"position" integer NOT NULL,
	"status" "status_enum" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "federation_person_status_position_idx" ON "federation_person" USING btree ("status","position");