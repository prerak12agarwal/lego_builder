CREATE TABLE `reconstruction_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`request_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`provider` text NOT NULL,
	`task` text,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`checked_at` integer DEFAULT 0 NOT NULL,
	`lease` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`message` text,
	`manifest` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_request_key` ON `reconstruction_jobs` (`owner`,`request_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_active_job_per_owner` ON `reconstruction_jobs` (`owner`) WHERE "reconstruction_jobs"."state" in ('submitting', 'queued', 'generating', 'collecting', 'unknown');--> statement-breakpoint
CREATE INDEX `owner_job_time` ON `reconstruction_jobs` (`owner`,`created_at`);--> statement-breakpoint
CREATE INDEX `job_time` ON `reconstruction_jobs` (`created_at`);