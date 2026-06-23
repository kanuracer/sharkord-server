type TGitHubReleaseLike = {
  draft?: boolean;
  prerelease?: boolean;
  tag_name?: unknown;
};

type TReleaseSelectionOptions = {
  prerelease?: boolean;
  forkOnly?: boolean;
};

const normalizeReleaseVersion = (value: unknown): string | null => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || raw === '0.0.0') return null;
  return raw.replace(/^v/i, '');
};

const parseVersionParts = (version: string) => {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-kr\.(\d+))?$/);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    kr: match[4] ? Number(match[4]) : -1
  };
};

const compareReleaseVersions = (a: string, b: string) => {
  const parsedA = parseVersionParts(a);
  const parsedB = parseVersionParts(b);

  if (!parsedA && !parsedB) return a.localeCompare(b);
  if (!parsedA) return -1;
  if (!parsedB) return 1;

  return (
    parsedA.major - parsedB.major ||
    parsedA.minor - parsedB.minor ||
    parsedA.patch - parsedB.patch ||
    parsedA.kr - parsedB.kr
  );
};

const selectLatestReleaseVersion = (
  releases: TGitHubReleaseLike[] | undefined | null,
  options: TReleaseSelectionOptions = {}
): string | null => {
  const versions = (releases ?? [])
    .filter((release) => !release.draft)
    .filter((release) =>
      typeof options.prerelease === 'boolean'
        ? Boolean(release.prerelease) === options.prerelease
        : true
    )
    .map((release) => normalizeReleaseVersion(release.tag_name))
    .filter((version): version is string => Boolean(version))
    .filter((version) => (options.forkOnly ? version.includes('-kr.') : true));

  return versions.sort(compareReleaseVersions).at(-1) ?? null;
};

export {
  compareReleaseVersions,
  normalizeReleaseVersion,
  selectLatestReleaseVersion,
  type TGitHubReleaseLike
};
