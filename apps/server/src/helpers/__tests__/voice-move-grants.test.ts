import { afterEach, describe, expect, test } from 'bun:test';
import {
  clearVoiceMoveGrantsForTests,
  consumeVoiceMoveGrant,
  expireVoiceMoveGrant,
  grantVoiceMove,
  withVoiceMoveLock
} from '../voice-move-grants';

afterEach(clearVoiceMoveGrantsForTests);

describe('voice move grants', () => {
  test('expires only the matching elapsed grant token', () => {
    const firstGrant = grantVoiceMove(7, 11);
    const replacementGrant = grantVoiceMove(7, 12);

    expect(replacementGrant.previousChannelId).toBe(11);
    expect(
      expireVoiceMoveGrant(7, firstGrant.token, replacementGrant.expiresAt)
    ).toBeUndefined();
    expect(expireVoiceMoveGrant(7, replacementGrant.token, replacementGrant.expiresAt)).toBe(
      12
    );
    expect(consumeVoiceMoveGrant(7, 12)).toBe(false);
  });

  test('keeps a replacement grant after a delayed join to its old destination', () => {
    grantVoiceMove(7, 11);
    grantVoiceMove(7, 12);

    expect(consumeVoiceMoveGrant(7, 11)).toBe(false);
    expect(consumeVoiceMoveGrant(7, 12)).toBe(true);
  });

  test('serializes grant side effects for one moved user', async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = withVoiceMoveLock(7, async () => {
      order.push('first-start');
      await firstGate;
      order.push('first-end');
    });
    const second = withVoiceMoveLock(7, async () => order.push('second'));

    await Promise.resolve();
    expect(order).toEqual(['first-start']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(['first-start', 'first-end', 'second']);
  });
});
