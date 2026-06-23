import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const updaterSource = readFileSync(
  join(import.meta.dir, '../updater.ts'),
  'utf8'
);

test('server update checks use kanuracer fork releases', () => {
  expect(updaterSource).toContain("repoOwner: 'kanuracer'");
  expect(updaterSource).toContain("repoName: 'sharkord-server'");
  expect(updaterSource).not.toContain("repoOwner: 'Sharkord'");
  expect(updaterSource).not.toContain("repoName: 'sharkord'");
});

const getUpdateSource = readFileSync(
  join(import.meta.dir, '../../routers/others/get-update.ts'),
  'utf8'
);

const releaseVersionsSource = readFileSync(
  join(import.meta.dir, '../release-versions.ts'),
  'utf8'
);

test('server update route never exposes fake 0.0.0 as latest version', () => {
  expect(getUpdateSource).toContain('normalizeReleaseVersion');
  expect(releaseVersionsSource).toContain("raw === '0.0.0'");
  expect(releaseVersionsSource).toContain('return null');
  expect(getUpdateSource).toContain(
    'api.github.com/repos/kanuracer/sharkord-server/releases'
  );
  expect(getUpdateSource).not.toContain("return '0.0.0'");
});

test('server beta update fallback selects highest fork prerelease instead of GitHub API order', () => {
  expect(getUpdateSource).toContain("SERVER_VERSION.includes('-kr.')");
  expect(getUpdateSource).toContain('getLatestBetaReleaseTagVersion');
  expect(getUpdateSource).toContain('selectLatestReleaseVersion');
  expect(getUpdateSource).toContain('forkOnly: true');
  expect(getUpdateSource).toContain('per_page=100');
});
