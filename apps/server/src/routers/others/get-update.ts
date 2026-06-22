import { Permission } from '@sharkord/shared';
import { SERVER_VERSION } from '../../utils/env';
import { protectedProcedure } from '../../utils/trpc';
import { updater } from '../../utils/updater';

const GITHUB_LATEST_RELEASE_URL =
  'https://api.github.com/repos/kanuracer/sharkord-server/releases/latest';

const normalizeReleaseVersion = (value: unknown): string | null => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || raw === '0.0.0') return null;
  return raw.replace(/^v/i, '');
};

const getLatestReleaseTagVersion = async (): Promise<string | null> => {
  try {
    const response = await fetch(GITHUB_LATEST_RELEASE_URL, {
      headers: { accept: 'application/vnd.github+json' }
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { tag_name?: unknown };
    return normalizeReleaseVersion(payload.tag_name);
  } catch {
    return null;
  }
};

const getLatestVersion = async () => {
  try {
    const latestVersion = normalizeReleaseVersion(await updater.getLatestVersion());
    if (latestVersion) return latestVersion;
  } catch {
    // Older/manual GitHub releases may not include bun-sfe-autoupdater metadata.
  }
  return getLatestReleaseTagVersion();
};

const hasUpdates = async () => {
  try {
    return await updater.hasUpdates();
  } catch {
    return false;
  }
};

const getUpdateRoute = protectedProcedure.query(async ({ ctx }) => {
  await ctx.needsPermission(Permission.MANAGE_UPDATES);

  const [latestVersion, hasUpdate] = await Promise.all([
    getLatestVersion(),
    hasUpdates()
  ]);

  return {
    canUpdate: updater.canUpdate(),
    latestVersion,
    hasUpdate,
    currentVersion: SERVER_VERSION
  };
});

export { getUpdateRoute };
