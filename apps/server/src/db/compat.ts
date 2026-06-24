import type { Database } from 'bun:sqlite';

type TTableInfoRow = { name: string };

const tableExists = (sqlite: Database, tableName: string): boolean => {
  const row = sqlite
    .query<{ name: string }, [string]>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
    )
    .get(tableName);

  return !!row;
};

const getColumnNames = (sqlite: Database, tableName: string): Set<string> => {
  const rows = sqlite
    .query<TTableInfoRow, []>(`PRAGMA table_info(${tableName})`)
    .all();

  return new Set(rows.map((row) => row.name));
};

const ensureRoleWeightColumn = (sqlite: Database) => {
  if (!tableExists(sqlite, 'roles')) return;

  const columns = getColumnNames(sqlite, 'roles');
  if (!columns.has('weight')) {
    sqlite.run('ALTER TABLE `roles` ADD `weight` integer DEFAULT 100 NOT NULL;');
    sqlite.run(
      "UPDATE `roles` SET `weight` = CASE WHEN `id` = 1 OR lower(`name`) = 'owner' THEN 0 ELSE 100 END;"
    );
  }

  sqlite.run('CREATE INDEX IF NOT EXISTS `roles_weight_idx` ON `roles` (`weight`);');
};

export { ensureRoleWeightColumn };
