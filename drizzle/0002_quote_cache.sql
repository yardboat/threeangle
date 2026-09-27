CREATE TABLE `quote_cache` (
	`work_key` text PRIMARY KEY NOT NULL,
	`quotes` text NOT NULL,
	`created_at` integer NOT NULL
);
