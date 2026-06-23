import { expect, test } from 'bun:test';
import { selectLatestReleaseVersion } from '../release-versions';

test('selects highest kr prerelease version instead of first GitHub API item', () => {
  const latest = selectLatestReleaseVersion(
    [
      { tag_name: 'v0.0.23-kr.9', draft: false, prerelease: true },
      { tag_name: 'v0.0.23-kr.11', draft: false, prerelease: true },
      { tag_name: 'v0.0.23-kr.10', draft: false, prerelease: true }
    ],
    { prerelease: true, forkOnly: true }
  );

  expect(latest).toBe('0.0.23-kr.11');
});

test('ignores drafts, fake versions, and stable releases for fork prerelease lookup', () => {
  const latest = selectLatestReleaseVersion(
    [
      { tag_name: 'v0.0.23-kr.99', draft: true, prerelease: true },
      { tag_name: 'v0.0.23', draft: false, prerelease: false },
      { tag_name: '0.0.0', draft: false, prerelease: true },
      { tag_name: 'v0.0.23-kr.12', draft: false, prerelease: true }
    ],
    { prerelease: true, forkOnly: true }
  );

  expect(latest).toBe('0.0.23-kr.12');
});
