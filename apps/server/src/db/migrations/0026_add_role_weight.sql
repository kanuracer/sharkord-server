ALTER TABLE `roles` ADD `weight` integer DEFAULT 100 NOT NULL;--> statement-breakpoint
UPDATE `roles` SET `weight` = CASE WHEN `id` = 1 OR lower(`name`) = 'owner' THEN 0 ELSE 100 END;--> statement-breakpoint
CREATE INDEX `roles_weight_idx` ON `roles` (`weight`);
