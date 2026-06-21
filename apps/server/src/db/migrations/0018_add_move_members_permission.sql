INSERT OR IGNORE INTO `role_permissions` (
  `role_id`,
  `permission`,
  `created_at`,
  `updated_at`
)
SELECT
  1,
  'MOVE_MEMBERS',
  unixepoch() * 1000,
  unixepoch() * 1000
WHERE EXISTS (
  SELECT 1 FROM `roles` WHERE `id` = 1
);
--> statement-breakpoint
DELETE FROM `role_permissions`
WHERE `role_id` IN (
  SELECT `id` FROM `roles` WHERE `name` = 'Move_Members'
);
--> statement-breakpoint
DELETE FROM `user_roles`
WHERE `role_id` IN (
  SELECT `id` FROM `roles` WHERE `name` = 'Move_Members'
);
--> statement-breakpoint
DELETE FROM `roles`
WHERE `name` = 'Move_Members';
