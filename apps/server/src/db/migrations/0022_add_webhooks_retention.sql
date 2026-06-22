ALTER TABLE `settings` ADD `retention_cleanup_enabled` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `settings` ADD `message_retention_days` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `settings` ADD `media_retention_days` integer NOT NULL DEFAULT 0;--> statement-breakpoint
CREATE TABLE `incoming_webhooks` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `channel_id` integer NOT NULL,
  `token_hash` text NOT NULL,
  `created_by` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer,
  `last_used_at` integer,
  FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE INDEX `incoming_webhooks_channel_idx` ON `incoming_webhooks` (`channel_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `incoming_webhooks_token_hash_idx` ON `incoming_webhooks` (`token_hash`);
