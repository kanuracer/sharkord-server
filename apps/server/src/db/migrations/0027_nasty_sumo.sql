CREATE TABLE `ip_security_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip` text NOT NULL,
	`identity` text,
	`event` text NOT NULL,
	`reason` text,
	`metadata` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ip_security_events_ip_idx` ON `ip_security_events` (`ip`);--> statement-breakpoint
CREATE INDEX `ip_security_events_event_idx` ON `ip_security_events` (`event`);--> statement-breakpoint
CREATE INDEX `ip_security_events_created_idx` ON `ip_security_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `ip_security_events_ip_created_idx` ON `ip_security_events` (`ip`,`created_at`);--> statement-breakpoint
CREATE TABLE `ip_security_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`ip_range` text NOT NULL,
	`reason` text,
	`expires_at` integer,
	`created_by` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ip_security_rules_kind_idx` ON `ip_security_rules` (`kind`);--> statement-breakpoint
CREATE INDEX `ip_security_rules_ip_range_idx` ON `ip_security_rules` (`ip_range`);--> statement-breakpoint
CREATE INDEX `ip_security_rules_expires_idx` ON `ip_security_rules` (`expires_at`);--> statement-breakpoint
CREATE INDEX `ip_security_rules_kind_ip_idx` ON `ip_security_rules` (`kind`,`ip_range`);