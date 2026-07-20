const MOVE_GRANT_TTL_MS = 30_000;

export type TVoiceMoveGrant = {
  channelId: number;
  expiresAt: number;
  token: number;
};

export type TGrantedVoiceMove = TVoiceMoveGrant & {
  previousChannelId?: number;
};

const voiceMoveGrants = new Map<number, TVoiceMoveGrant>();
const voiceMoveLocks = new Map<number, Promise<void>>();
let nextGrantToken = 1;

const withVoiceMoveLock = async <T>(
  userId: number,
  action: () => Promise<T>
): Promise<T> => {
  const previous = voiceMoveLocks.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => gate);
  voiceMoveLocks.set(userId, tail);
  await previous;

  try {
    return await action();
  } finally {
    release();
    if (voiceMoveLocks.get(userId) === tail) voiceMoveLocks.delete(userId);
  }
};

const grantVoiceMove = (
  userId: number,
  channelId: number
): TGrantedVoiceMove => {
  const previousChannelId = voiceMoveGrants.get(userId)?.channelId;
  const grant = {
    channelId,
    expiresAt: Date.now() + MOVE_GRANT_TTL_MS,
    token: nextGrantToken++
  };
  voiceMoveGrants.set(userId, grant);
  return { ...grant, previousChannelId };
};

const expireVoiceMoveGrant = (
  userId: number,
  token: number,
  now = Date.now()
): number | undefined => {
  const grant = voiceMoveGrants.get(userId);

  if (!grant || grant.token !== token || grant.expiresAt > now) return undefined;

  voiceMoveGrants.delete(userId);
  return grant.channelId;
};

const consumeVoiceMoveGrant = (userId: number, channelId: number): boolean => {
  const grant = voiceMoveGrants.get(userId);

  if (!grant || grant.channelId !== channelId) return false;

  voiceMoveGrants.delete(userId);
  return grant.expiresAt > Date.now();
};

const hasVoiceMoveGrant = (userId: number, channelId: number): boolean => {
  const grant = voiceMoveGrants.get(userId);
  return Boolean(grant && grant.channelId === channelId && grant.expiresAt > Date.now());
};

const clearVoiceMoveGrantsForTests = (): void => {
  voiceMoveGrants.clear();
  voiceMoveLocks.clear();
  nextGrantToken = 1;
};

export {
  clearVoiceMoveGrantsForTests,
  consumeVoiceMoveGrant,
  expireVoiceMoveGrant,
  grantVoiceMove,
  hasVoiceMoveGrant,
  MOVE_GRANT_TTL_MS,
  withVoiceMoveLock
};
