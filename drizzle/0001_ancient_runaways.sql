CREATE TABLE `corner_draft` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`lookup` text NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`result` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `corner_usage` (
	`scope` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
