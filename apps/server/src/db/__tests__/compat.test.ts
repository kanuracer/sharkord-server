import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { ensureRoleWeightColumn } from '../compat';

describe('database compatibility repairs', () => {
  test('adds missing role weight column and preserves admin ordering defaults', () => {
    const sqlite = new Database(':memory:', { create: true, strict: true });
    sqlite.run(
      'CREATE TABLE `roles` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `name` text NOT NULL);'
    );
    sqlite.run("INSERT INTO `roles` (`id`, `name`) VALUES (1, 'Owner'), (2, 'Member'), (3, 'Moderator');");

    ensureRoleWeightColumn(sqlite);

    const rows = sqlite
      .query<{ id: number; weight: number }, []>('SELECT `id`, `weight` FROM `roles` ORDER BY `id`')
      .all();

    expect(rows).toEqual([
      { id: 1, weight: 0 },
      { id: 2, weight: 100 },
      { id: 3, weight: 100 }
    ]);
    expect(
      sqlite
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'roles_weight_idx'"
        )
        .get()?.name
    ).toBe('roles_weight_idx');
  });
});
