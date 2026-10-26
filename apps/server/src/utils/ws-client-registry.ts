import jwt from 'jsonwebtoken';
import { WebSocket } from 'ws';
import { getServerToken } from '../db/queries/server';
import type { TTokenPayload } from '../types';

const wsClients = new Set<WebSocket>();

const registerWsClient = (client: WebSocket) => {
  wsClients.add(client);
};

const unregisterWsClient = (client: WebSocket) => {
  wsClients.delete(client);
};

// Close payloads allow 123 UTF-8 bytes after the two-byte status code.
const wireCloseReason = (reason = '') => {
  let result = '';
  for (const character of reason) {
    if (Buffer.byteLength(result + character, 'utf8') > 123) break;
    result += character;
  }
  return result;
};

const closeSocketsForUser = async (
  userId: number,
  code: number,
  reason?: string
) => {
  const serverToken = await getServerToken();
  const failures: unknown[] = [];
  const wireReason = wireCloseReason(reason);

  for (const client of wsClients) {
    if (client.readyState !== WebSocket.OPEN) continue;

    let matches = client.userId === userId;
    if (!matches && client.token) {
      try {
        matches =
          (jwt.verify(client.token, serverToken) as TTokenPayload).userId ===
          userId;
      } catch {
        // Invalid tokens cannot authenticate; do not hide disconnect failures here.
      }
    }
    if (!matches) continue;

    try {
      client.close(code, wireReason);
      // Bound the close handshake even if the peer never acknowledges it.
      const timeout = setTimeout(() => client.terminate(), 1000);
      timeout.unref();
      client.once('close', () => clearTimeout(timeout));
    } catch {
      try {
        client.terminate();
      } catch (error) {
        failures.push(error);
      }
    }
  }

  if (failures.length) {
    throw new AggregateError(failures, 'Failed to disconnect user sessions');
  }
};

const closeSocketsForAppPassword = async (
  userId: number,
  appPasswordId: number
) => {
  const serverToken = await getServerToken();

  for (const client of wsClients) {
    if (!client.token || client.readyState !== WebSocket.OPEN) continue;

    try {
      const decoded = jwt.verify(client.token, serverToken) as TTokenPayload;

      if (
        decoded.userId === userId &&
        decoded.appPasswordId === appPasswordId
      ) {
        client.close(4001, 'App password revoked');
      }
    } catch {
      // Ignore sockets with malformed/stale tokens; normal auth paths handle them.
    }
  }
};

export {
  closeSocketsForAppPassword,
  closeSocketsForUser,
  registerWsClient,
  unregisterWsClient
};
