const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;

type TotpOptions = {
  timestamp?: number;
  window?: number;
};

const sanitizeCode = (code: string) => code.replace(/\s+/g, '');

const encodeBase32 = (bytes: Uint8Array) => {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
};

const decodeBase32 = (secret: string) => {
  const normalized = secret.toUpperCase().replace(/=|\s|-/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid TOTP secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
};

const counterBuffer = (counter: number) => {
  const buffer = new Uint8Array(8);
  const view = new DataView(buffer.buffer);
  view.setUint32(4, counter >>> 0, false);
  view.setUint32(0, Math.floor(counter / 2 ** 32), false);
  return buffer;
};

const randomBytes = (size: number) => {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
};

const generateTotpCodeForCounter = (secret: string, counter: number) => {
  const hmac = new Bun.CryptoHasher('sha1', decodeBase32(secret));
  hmac.update(counterBuffer(counter));
  const digest = hmac.digest() as Uint8Array;
  const offset = digest[digest.length - 1]! & 0xf;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
};

export const generateTotpSecret = () => encodeBase32(randomBytes(20));

export const generateTotpCode = (secret: string, timestamp = Date.now()) => {
  const counter = Math.floor(timestamp / 1000 / TOTP_STEP_SECONDS);
  return generateTotpCodeForCounter(secret, counter);
};

export const verifyTotpCode = (
  secret: string,
  code: string,
  options: TotpOptions = {}
) => {
  const normalized = sanitizeCode(code);
  if (!/^\d{6}$/.test(normalized)) return false;
  const timestamp = options.timestamp ?? Date.now();
  const skewWindow = options.window ?? 1;
  const counter = Math.floor(timestamp / 1000 / TOTP_STEP_SECONDS);

  for (let offset = -skewWindow; offset <= skewWindow; offset++) {
    if (generateTotpCodeForCounter(secret, counter + offset) === normalized)
      return true;
  }

  return false;
};

export const createTotpUri = (
  secret: string,
  identity: string,
  issuer = 'Sharkord'
) => {
  const label = encodeURIComponent(`${issuer}:${identity}`);
  const params = [
    ['secret', secret],
    ['issuer', issuer],
    ['algorithm', 'SHA1'],
    ['digits', String(TOTP_DIGITS)],
    ['period', String(TOTP_STEP_SECONDS)]
  ] satisfies Array<[string, string]>;

  const query = params
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    )
    .join('&');

  return `otpauth://totp/${label}?${query}`;
};
