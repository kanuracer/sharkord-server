import { sha256 } from '@sharkord/shared';

const authenticatedConnectionTokenHashes = new Set<string>();

const getConnectionTokenHash = async (token: string) => sha256(token);

const markConnectionTokenAuthenticated = async (token: string | undefined) => {
  if (!token) return;

  authenticatedConnectionTokenHashes.add(await getConnectionTokenHash(token));
};

const isConnectionTokenAuthenticated = async (token: string) => {
  return authenticatedConnectionTokenHashes.has(await getConnectionTokenHash(token));
};

const clearAuthenticatedConnectionTokensForTests = () => {
  authenticatedConnectionTokenHashes.clear();
};

export {
  clearAuthenticatedConnectionTokensForTests,
  isConnectionTokenAuthenticated,
  markConnectionTokenAuthenticated
};
