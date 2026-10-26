import semver from 'semver';

const MINIMUM_BUN_VERSION = '1.4.4';

const assertBuildRuntime = (version: string = Bun.version) => {
  if (!semver.valid(version) || semver.lt(version, MINIMUM_BUN_VERSION)) {
    throw new Error(
      `Building Sharkord requires Bun ${MINIMUM_BUN_VERSION} or newer`
    );
  }
};

export { MINIMUM_BUN_VERSION, assertBuildRuntime };
