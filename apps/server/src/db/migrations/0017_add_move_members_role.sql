INSERT INTO `roles` (
  `name`,
  `color`,
  `is_persistent`,
  `is_default`,
  `storage_quota_override_enabled`,
  `storage_space_quota`,
  `created_at`,
  `updated_at`
)
SELECT
  'Move_Members',
  '#5865f2',
  false,
  false,
  false,
  0,
  unixepoch() * 1000,
  unixepoch() * 1000
WHERE EXISTS (
  SELECT 1 FROM `roles`
)
AND NOT EXISTS (
  SELECT 1 FROM `roles` WHERE `name` = 'Move_Members'
);
--> statement-breakpoint
INSERT OR IGNORE INTO `role_permissions` (
  `role_id`,
  `permission`,
  `created_at`,
  `updated_at`
)
SELECT
  `id`,
  'JOIN_VOICE_CHANNELS',
  unixepoch() * 1000,
  unixepoch() * 1000
FROM `roles`
WHERE `name` = 'Move_Members';
--> statement-breakpoint
INSERT OR IGNORE INTO `role_permissions` (
  `role_id`,
  `permission`,
  `created_at`,
  `updated_at`
)
SELECT
  `id`,
  'MANAGE_USERS',
  unixepoch() * 1000,
  unixepoch() * 1000
FROM `roles`
WHERE `name` = 'Move_Members';
