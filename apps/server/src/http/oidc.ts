import { createPublicKey, randomBytes } from 'crypto';
import { and, eq } from 'drizzle-orm';
import jwt, { type JwtHeader, type JwtPayload } from 'jsonwebtoken';
import z from 'zod';
import { config } from '../config';
import { db } from '../db';
import { publishUser } from '../db/publishers';
import { getDefaultRole } from '../db/queries/roles';
import { getServerToken } from '../db/queries/server';
import { userOidcAccounts, userRoles, users } from '../db/schema';
import { getJsonBody, type HttpRouteHandler } from './helpers';
import { HttpValidationError } from './utils';

type JwksKey = Record<string, unknown> & {
  kid?: string;
  alg?: string;
  use?: string;
  kty?: string;
};
type OidcProviderRuntimeConfig = (typeof config.oidc.providers)[number];

type PublicOidcProviderConfig = {
  id: string;
  name: string;
  issuer: string;
  clientId: string;
  authorizationEndpoint: string;
  scopes: string[];
};

type VerifiedOidcClaims = JwtPayload & {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
};

const zBody = z.object({
  provider: z.string().trim().min(1),
  idToken: z.string().trim().optional(),
  code: z.string().trim().optional(),
  redirectUri: z.string().trim().optional()
});

const publicProviders = (): PublicOidcProviderConfig[] => {
  if (!config.oidc.enabled) return [];
  return config.oidc.providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    issuer: provider.issuer,
    clientId: provider.clientId,
    authorizationEndpoint: provider.authorizationEndpoint,
    scopes: provider.scopes
  }));
};

const getProvider = (id: string) =>
  config.oidc.providers.find((provider) => provider.id === id);

const oidcConfigRouteHandler: HttpRouteHandler = (_req, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  });
  res.end(
    JSON.stringify({
      enabled: config.oidc.enabled,
      providers: publicProviders()
    })
  );
};

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) }
  });
  if (!response.ok)
    throw new Error(`OIDC provider request failed (${response.status})`);
  return response.json() as Promise<T>;
};

const exchangeCodeForIdToken = async (
  provider: OidcProviderRuntimeConfig,
  code: string,
  redirectUri?: string
): Promise<string> => {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: provider.clientId
  });
  if (redirectUri) body.set('redirect_uri', redirectUri);
  if (provider.clientSecret) body.set('client_secret', provider.clientSecret);

  const tokenResponse = await fetchJson<{ id_token?: string }>(
    provider.tokenEndpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    }
  );

  if (!tokenResponse.id_token)
    throw new Error('OIDC token endpoint did not return id_token');
  return tokenResponse.id_token;
};

const getProviderJwks = async (
  provider: OidcProviderRuntimeConfig
): Promise<{ keys: JwksKey[] }> => {
  if (provider.jwks?.keys?.length)
    return { keys: provider.jwks.keys as JwksKey[] };
  return fetchJson<{ keys: JwksKey[] }>(provider.jwksUri);
};

const selectJwk = (jwks: { keys: JwksKey[] }, header: JwtHeader): JwksKey => {
  const candidates = jwks.keys.filter(
    (key) =>
      (!header.kid || key.kid === header.kid) && (!key.use || key.use === 'sig')
  );
  const key = candidates[0];
  if (!key) throw new Error('OIDC signing key not found');
  return key;
};

const claimString = (claims: JwtPayload, name: string): string | undefined => {
  const value = claims[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const verifyIdToken = async (
  provider: OidcProviderRuntimeConfig,
  idToken: string
): Promise<VerifiedOidcClaims> => {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || typeof decoded === 'string')
    throw new Error('OIDC token decode failed');
  const header = decoded.header;
  const jwk = selectJwk(await getProviderJwks(provider), header);
  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const claims = jwt.verify(idToken, publicKey, {
    algorithms: ['RS256'],
    audience: provider.clientId,
    issuer: provider.issuer
  });
  if (!claims || typeof claims === 'string')
    throw new Error('OIDC token payload invalid');
  const subject = claimString(claims, provider.subjectClaim || 'sub');
  if (!subject) throw new Error('OIDC token missing subject');
  return {
    ...claims,
    sub: subject,
    email: claimString(claims, provider.emailClaim || 'email'),
    name: claimString(claims, provider.nameClaim || 'name')
  };
};

const normalizeIdentity = (value: string) => value.trim().toLowerCase();
const safeGeneratedIdentity = (provider: string, subject: string) =>
  normalizeIdentity(`${provider}-${subject}`)
    .replace(/[^a-z0-9._-]/g, '-')
    .slice(0, 80) || `oidc-${randomBytes(8).toString('hex')}`;

const createOidcUser = async (
  provider: OidcProviderRuntimeConfig,
  claims: VerifiedOidcClaims
) => {
  const defaultRole = await getDefaultRole();
  if (!defaultRole) throw new Error('Default role not found');

  const identity = claims.email
    ? normalizeIdentity(claims.email)
    : safeGeneratedIdentity(provider.id, claims.sub);
  const name =
    claims.name || claims.preferred_username || claims.email || identity;
  const now = Date.now();
  const user = await db
    .insert(users)
    .values({
      identity,
      name,
      password: await Bun.password.hash(
        `oidc:${randomBytes(32).toString('base64url')}`
      ),
      createdAt: now
    })
    .returning()
    .get();

  await db
    .insert(userRoles)
    .values({ roleId: defaultRole.id, userId: user.id, createdAt: now });
  publishUser(user.id, 'create');
  return user;
};

const resolveOidcUser = async (
  provider: OidcProviderRuntimeConfig,
  claims: VerifiedOidcClaims
) => {
  const existingLink = await db
    .select({ userId: userOidcAccounts.userId })
    .from(userOidcAccounts)
    .where(
      and(
        eq(userOidcAccounts.provider, provider.id),
        eq(userOidcAccounts.subject, claims.sub)
      )
    )
    .get();

  if (existingLink) {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, existingLink.userId))
      .get();
    if (user) return user;
  }

  let user =
    claims.email && provider.allowEmailAutoLink
      ? await db
          .select()
          .from(users)
          .where(eq(users.identity, normalizeIdentity(claims.email)))
          .get()
      : null;
  if (!user && provider.allowRegistration)
    user = await createOidcUser(provider, claims);
  if (!user)
    throw new HttpValidationError('oidc', 'OIDC account is not linked');

  const now = Date.now();
  await db
    .insert(userOidcAccounts)
    .values({
      provider: provider.id,
      subject: claims.sub,
      userId: user.id,
      email: claims.email,
      createdAt: now,
      lastLoginAt: now
    })
    .onConflictDoUpdate({
      target: [userOidcAccounts.provider, userOidcAccounts.subject],
      set: { userId: user.id, email: claims.email, lastLoginAt: now }
    })
    .run();
  return user;
};

const oidcLoginRouteHandler: HttpRouteHandler = async (req, res) => {
  if (!config.oidc.enabled)
    throw new HttpValidationError('oidc', 'OIDC login is not enabled');

  const body = zBody.parse(await getJsonBody(req));
  const provider = getProvider(body.provider);
  if (!provider)
    throw new HttpValidationError(
      'provider',
      'OIDC provider is not configured'
    );
  if (!body.idToken && !body.code)
    throw new HttpValidationError('oidc', 'OIDC idToken or code is required');

  let claims: VerifiedOidcClaims;
  try {
    const idToken =
      body.idToken ||
      (await exchangeCodeForIdToken(provider, body.code!, body.redirectUri));
    claims = await verifyIdToken(provider, idToken);
  } catch {
    throw new HttpValidationError('oidc', 'OIDC token verification failed');
  }

  const user = await resolveOidcUser(provider, claims);
  if (user.banned)
    throw new HttpValidationError(
      'identity',
      `Identity banned: ${user.banReason || 'No reason provided'}`
    );

  await db
    .update(users)
    .set({ lastLoginAt: Date.now() })
    .where(eq(users.id, user.id))
    .run();

  const token = jwt.sign({ userId: user.id }, await getServerToken(), {
    expiresIn: '604800s'
  });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true, token }));
};

export { oidcConfigRouteHandler, oidcLoginRouteHandler };
