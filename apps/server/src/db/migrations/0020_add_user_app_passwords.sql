CREATE TABLE `user_app_passwords` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `name` text NOT NULL,
  `token_hash` text NOT NULL,
  `created_at` integer NOT NULL,
  `last_used_at` integer,
  `revoked_at` integer,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `user_app_passwords_token_hash_idx` ON `user_app_passwords` (`token_hash`);--> statement-breakpoint
CREATE INDEX `user_app_passwords_user_idx` ON `user_app_passwords` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_app_passwords_revoked_idx` ON `user_app_passwords` (`revoked_at`);