CREATE TABLE `conversion_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`source_job_id` text NOT NULL,
	`owner` text NOT NULL,
	`request_key` text NOT NULL,
	`settings` text NOT NULL,
	`settings_hash` text NOT NULL,
	`source_obj_sha256` text NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`lease` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`ldr_hash` text,
	`revision_hash` text,
	`result` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversion_request_key` ON `conversion_requests` (`owner`,`request_key`);--> statement-breakpoint
CREATE INDEX `conversion_owner_source` ON `conversion_requests` (`owner`,`source_job_id`);
