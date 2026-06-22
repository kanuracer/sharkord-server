CREATE TABLE `user_oidc_accounts` (
  `provider` text NOT NULL,
  `subject` text NOT NULL,
  `user_id` integer NOT NULL,
  `email` text,
  `created_at` integer NOT NULL,
  `last_login_at` integer NOT NULL,
  PRIMARY KEY(`provider`, `subject`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `user_oidc_accounts_user_idx` ON `user_oidc_accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_oidc_accounts_email_idx` ON `user_oidc_accounts` (`email`);
