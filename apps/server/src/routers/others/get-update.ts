import { Permission } from '@sharkord/shared';
import { SERVER_VERSION } from '../../utils/env';
import {
  normalizeReleaseVersion,
  selectLatestReleaseVersion,
  type TGitHubReleaseLike
} from '../../utils/release-versions';
import { protectedProcedure } from '../../utils/trpc';
import { updater } from '../../utils/updater';

const GITHUB_RELEASES_URL =
  'https://api.github.com/repos/kanuracer/sharkord-server/releases';
const GITHUB_LATEST_RELEASE_URL = `${GITHUB_RELEASES_URL}/latest`;

type GitHubRelease = TGitHubReleaseLike;

const fetchGitHubJson = async <T>(url: string): Promise<T | null> => {
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/vnd.github+json' }
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const getLatestStableReleaseTagVersion = async (): Promise<string | null> => {
  const payload = await fetchGitHubJson<GitHubRelease>(
    GITHUB_LATEST_RELEASE_URL
  );
  return normalizeReleaseVersion(payload?.tag_name);
};

const getLatestBetaReleaseTagVersion = async (): Promise<string | null> => {
  const releases = await fetchGitHubJson<GitHubRelease[]>(
    `${GITHUB_RELEASES_URL}?per_page=100`
  );

  return selectLatestReleaseVersion(releases, {
    prerelease: true,
    forkOnly: true
  });
};

const getLatestVersion = async () => {
  if (SERVER_VERSION.includes('-kr.')) {
    const latestBetaVersion = await getLatestBetaReleaseTagVersion();
    if (latestBetaVersion) return latestBetaVersion;
  }

  try {
    const latestVersion = normalizeReleaseVersion(
      await updater.getLatestVersion()
    );
    if (latestVersion) return latestVersion;
  } catch {
    // Older/manual GitHub releases may not include bun-sfe-autoupdater metadata.
  }

  return getLatestStableReleaseTagVersion();
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
