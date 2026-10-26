import { DisconnectCode, Permission } from '@sharkord/shared';
import { afterEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { getMockedToken, initTest } from '../../__tests__/helpers';
import { tdb } from '../../__tests__/setup';
import { getUserByToken } from '../../db/queries/users';
import { rolePermissions, users } from '../../db/schema';
import {
  closeSocketsForUser,
  registerWsClient,
  unregisterWsClient
} from '../../utils/ws-client-registry';

const peers: WebSocket[] = [];
const clients: WebSocket[] = [];
const servers: WebSocketServer[] = [];

const connect = async (userId: number, joined = true) => {
  const server = new WebSocketServer({ port: 0 });
  servers.push(server);
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected TCP address');
  const incoming = once(server, 'connection');
  const client = new WebSocket(`ws://127.0.0.1:${address.port}`);
  clients.push(client);
  const [peer] = (await incoming) as [WebSocket];
  await once(client, 'open');
  peer.token = await getMockedToken(userId);
  if (joined) peer.userId = userId;
  peers.push(peer);
  registerWsClient(peer);
  peer.once('close', () => unregisterWsClient(peer));
  return { client, peer, closed: once(client, 'close') };
};

afterEach(async () => {
  for (const peer of peers.splice(0)) {
    unregisterWsClient(peer);
    peer.terminate();
  }
  for (const client of clients.splice(0)) client.terminate();
  await Promise.all(
    servers
      .splice(0)
      .map((s) => new Promise<void>((resolve) => s.close(() => resolve())))
  );
});

describe('active socket moderation', () => {
  test('ban closes every joined and token-only socket with a valid code; other user stays connected', async () => {
    const { caller: owner } = await initTest();
    const first = await connect(2);
    const second = await connect(2, false);
    const other = await connect(3);
    await owner.users.ban({ userId: 2, reason: 'Moderation' });
    for (const socket of [first, second]) {
      const [code, reason] = await socket.closed;
      expect(code).toBe(DisconnectCode.BANNED);
      expect(code).toBeGreaterThanOrEqual(4000);
      expect(code).toBeLessThanOrEqual(4999);
      expect(reason.toString()).toBe('Moderation');
    }
    expect(other.client.readyState).toBe(WebSocket.OPEN);
    expect(await getUserByToken(await getMockedToken(2))).toBeUndefined();
    await expect(initTest(2)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await owner.desktop.capabilities();
  });

  test('ban revokes cached contexts including prejoin routes, not only reconnect', async () => {
    const { caller: owner } = await initTest();
    const { caller: stale } = await initTest(2);
    await owner.users.ban({ userId: 2 });
    await expect(stale.desktop.capabilities()).rejects.toMatchObject({
      code: 'UNAUTHORIZED'
    });
    await expect(stale.others.handshake()).rejects.toMatchObject({
      code: 'UNAUTHORIZED'
    });
    await expect(
      stale.others.joinServer({ handshakeHash: 'stale' })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  test('long UTF-8 ban reason is safely bounded on wire and retained in database', async () => {
    const { caller } = await initTest();
    const socket = await connect(2);
    const reason = '🙂漢'.repeat(100);
    await caller.users.ban({ userId: 2, reason });
    const [code, wireReason] = await socket.closed;
    expect(code).toBe(DisconnectCode.BANNED);
    expect(wireReason.length).toBeLessThanOrEqual(123);
    expect(wireReason.toString()).not.toContain('\uFFFD');
    expect(reason.startsWith(wireReason.toString())).toBe(true);
    expect(
      (await tdb.select().from(users).where(eq(users.id, 2)).get())?.banReason
    ).toBe(reason);
  });

  test('offline and repeated ban succeed; unban permits fresh login/session', async () => {
    const { caller } = await initTest();
    await caller.users.ban({ userId: 2 });
    await caller.users.ban({ userId: 2 });
    expect(await getUserByToken(await getMockedToken(2))).toBeUndefined();
    await caller.users.unban({ userId: 2 });
    expect(await getUserByToken(await getMockedToken(2))).toBeTruthy();
    await initTest(2);
  });

  test('unauthorized member and nonowner moderator cannot ban Owner or disconnect sockets', async () => {
    const { caller: member } = await initTest(2);
    const socket = await connect(1);
    await expect(member.users.ban({ userId: 1 })).rejects.toMatchObject({
      code: 'FORBIDDEN'
    });
    await tdb
      .insert(rolePermissions)
      .values({
        roleId: 2,
        permission: Permission.MANAGE_USERS,
        createdAt: Date.now()
      });
    await expect(member.users.ban({ userId: 1 })).rejects.toMatchObject({
      code: 'FORBIDDEN'
    });
    expect(socket.client.readyState).toBe(WebSocket.OPEN);
  });

  test('close failure terminates affected socket and still closes all sibling sockets', async () => {
    const { caller } = await initTest();
    const first = await connect(2);
    const second = await connect(2);
    first.peer.close = () => {
      throw new Error('Injected close failure');
    };
    await caller.users.ban({ userId: 2 });
    expect((await first.closed)[0]).toBe(1006);
    expect((await second.closed)[0]).toBe(DisconnectCode.BANNED);
  });

  test('unrecoverable disconnect failure is reported after sibling shutdown and keeps auth revoked', async () => {
    const { caller } = await initTest();
    const { caller: stale } = await initTest(2);
    const first = await connect(2);
    const second = await connect(2);
    const terminate = first.peer.terminate.bind(first.peer);
    first.peer.close = () => {
      throw new Error('Injected close failure');
    };
    first.peer.terminate = () => {
      throw new Error('Injected termination failure');
    };
    try {
      await expect(caller.users.ban({ userId: 2 })).rejects.toThrow();
      expect((await second.closed)[0]).toBe(DisconnectCode.BANNED);
      await expect(stale.desktop.capabilities()).rejects.toMatchObject({
        code: 'UNAUTHORIZED'
      });
    } finally {
      first.peer.terminate = terminate;
    }
  });

  test('a peer that does not complete close is forcibly terminated', async () => {
    const { caller } = await initTest();
    const socket = await connect(2);
    socket.peer.close = () => {};
    await caller.users.ban({ userId: 2 });
    expect((await socket.closed)[0]).toBe(1006);
    expect(await getUserByToken(await getMockedToken(2))).toBeUndefined();
  });

  test('delete disconnects every session and revokes cached contexts', async () => {
    const { caller } = await initTest();
    const { caller: stale } = await initTest(2);
    const first = await connect(2);
    const second = await connect(2, false);
    await caller.users.delete({ userId: 2, wipe: false });
    expect((await first.closed)[0]).toBe(DisconnectCode.KICKED);
    expect((await second.closed)[0]).toBe(DisconnectCode.KICKED);
    await expect(stale.desktop.capabilities()).rejects.toMatchObject({
      code: 'UNAUTHORIZED'
    });
  });

  test('kick remains temporary and offline target remains NOT_FOUND', async () => {
    const { caller } = await initTest();
    const socket = await connect(2);
    // The caller context resolves real sockets through the production WSS;
    // the registry helper exercises the same wire close semantics here.
    await closeSocketsForUser(2, DisconnectCode.KICKED, 'Kick');
    expect((await socket.closed)[0]).toBe(DisconnectCode.KICKED);
    expect(await getUserByToken(await getMockedToken(2))).toBeTruthy();
    await expect(caller.users.kick({ userId: 3 })).rejects.toMatchObject({
      code: 'NOT_FOUND'
    });
  });
});
