import type http from 'http';
import { UAParser } from 'ua-parser-js';
import { config } from '../config';
import type { TConnectionInfo } from '../types';
import { resolveTrustedClientIp } from '../utils/ip-security';

const getWsIp = (
  ws: any | undefined,
  req: http.IncomingMessage | undefined
): string | undefined => {
  const socketCandidates = [
    ws?._socket?.remoteAddress,
    ws?.socket?.remoteAddress,
    req?.socket?.remoteAddress
  ].filter((v): v is string => typeof v === 'string' && v.length > 0);

  return resolveTrustedClientIp({
    headers: req?.headers ?? {},
    remoteAddress: socketCandidates[0],
    trustedProxies: config.security.trustedProxies
  });
};

const getWsInfo = (
  ws: any | undefined,
  req: http.IncomingMessage | undefined
): TConnectionInfo | undefined => {
  if (!ws && !req) return undefined;

  const ip = getWsIp(ws, req);
  const userAgent = req?.headers?.['user-agent'] || undefined;

  if (!ip && !userAgent) return undefined;

  let os: string | undefined;
  let device: string | undefined;

  if (userAgent) {
    try {
      const result = new UAParser(userAgent).getResult();

      os = result.os.name
        ? [result.os.name, result.os.version].filter(Boolean).join(' ')
        : undefined;

      device = result.device.type
        ? [result.device.vendor, result.device.model]
            .filter(Boolean)
            .join(' ')
            .trim() || undefined
        : 'Desktop';
    } catch {
      // agent parsing failed, ignore and proceed with undefined values
    }
  }

  return { ip, os, device, userAgent };
};

export { getWsInfo };
