CREATE TABLE `crate` (
	`user_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`saved_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `topic_id`)
);
