import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const updaterSource = readFileSync(join(import.meta.dir, '../updater.ts'), 'utf8');

test('server update checks use kanuracer fork releases', () => {
  expect(updaterSource).toContain("repoOwner: 'kanuracer'");
  expect(updaterSource).toContain("repoName: 'sharkord-server'");
  expect(updaterSource).not.toContain("repoOwner: 'Sharkord'");
  expect(updaterSource).not.toContain("repoName: 'sharkord'");
});
