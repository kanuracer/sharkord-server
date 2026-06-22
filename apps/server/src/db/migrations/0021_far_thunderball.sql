CREATE TABLE `direct_message_hidden_states` (
  `channel_id` integer NOT NULL,
  `user_id` integer NOT NULL,
  `hidden_at` integer NOT NULL,
  PRIMARY KEY(`channel_id`, `user_id`),
  FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `direct_message_hidden_states_user_idx` ON `direct_message_hidden_states` (`user_id`);--> statement-breakpoint
CREATE INDEX `direct_message_hidden_states_channel_idx` ON `direct_message_hidden_states` (`channel_id`);