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

export { closeSocketsForAppPassword, registerWsClient, unregisterWsClient };
