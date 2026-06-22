ALTER TABLE `roles` ADD `mentionable` integer NOT NULL DEFAULT 0;--> statement-breakpoint
CREATE TABLE `user_mfa_recovery_codes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `code_hash` text NOT NULL,
  `created_at` integer NOT NULL,
  `used_at` integer,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `user_mfa_recovery_codes_user_idx` ON `user_mfa_recovery_codes` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_mfa_recovery_codes_hash_idx` ON `user_mfa_recovery_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `user_mfa_recovery_codes_used_idx` ON `user_mfa_recovery_codes` (`used_at`);
