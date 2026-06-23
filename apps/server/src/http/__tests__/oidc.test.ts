import { beforeEach, describe, expect, test } from 'bun:test';
import { generateKeyPairSync, type KeyObject } from 'crypto';
import jwt from 'jsonwebtoken';
import { initTest, login } from '../../__tests__/helpers';
import { tdb, testsBaseUrl } from '../../__tests__/setup';
import { config } from '../../config';

const originalOidc = structuredClone(config.oidc);

const makeProviderFixture = () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048
  });
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
  const kid = 'local-dev-key-1';
  return {
    privateKey,
    publicProvider: {
      id: 'local-dev',
      name: 'Local Dev OIDC',
      issuer: 'https://oidc.dev.local',
      clientId: 'sharkord-desktop',
      authorizationEndpoint: 'https://oidc.dev.local/authorize',
      tokenEndpoint: 'https://oidc.dev.local/token',
      jwksUri: 'https://oidc.dev.local/jwks',
      scopes: ['openid', 'profile', 'email'],
      allowEmailAutoLink: true,
      allowRegistration: false,
      jwks: { keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] }
    }
  };
};

const signIdToken = (
  privateKey: KeyObject,
  overrides: Record<string, unknown> = {}
) =>
  jwt.sign(
    {
      iss: 'https://oidc.dev.local',
      aud: 'sharkord-desktop',
      sub: 'dev-user-1',
      email: 'testowner',
      name: 'Test Owner SSO',
      ...overrides
    },
    privateKey,
    { algorithm: 'RS256', keyid: 'local-dev-key-1', expiresIn: '5m' }
  );

beforeEach(() => {
  config.oidc.enabled = originalOidc.enabled;
  config.oidc.providers = structuredClone(originalOidc.providers);
});

describe('OIDC first pass', () => {
  test('advertises disabled OIDC config by default and rejects OIDC login without breaking local breakglass login', async () => {
    const configResponse = await fetch(`${testsBaseUrl}/auth/oidc/config`);
    expect(configResponse.status).toBe(200);
    await expect(configResponse.json()).resolves.toMatchObject({
      enabled: false,
      providers: []
    });

    const oidcResponse = await fetch(`${testsBaseUrl}/login/oidc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'default', idToken: 'not-a-token' })
    });
    expect(oidcResponse.status).toBe(400);
    await expect(oidcResponse.json()).resolves.toMatchObject({
      errors: { oidc: 'OIDC login is not enabled' }
    });

    const localResponse = await login('testowner', 'password123');
    expect(localResponse.status).toBe(200);
    await expect(localResponse.json()).resolves.toHaveProperty('token');
  });

  test('verifies a configured local OIDC provider id token and links the external subject to an existing identity', async () => {
    const { privateKey, publicProvider } = makeProviderFixture();
    config.oidc.enabled = true;
    config.oidc.providers = [publicProvider] as never;

    const configResponse = await fetch(`${testsBaseUrl}/auth/oidc/config`);
    expect(configResponse.status).toBe(200);
    const configBody = (await configResponse.json()) as {
      providers: Array<Record<string, unknown>>;
    };
    expect(configBody.providers[0]).toMatchObject({
      id: 'local-dev',
      name: 'Local Dev OIDC',
      clientId: 'sharkord-desktop'
    });
    expect(configBody.providers[0]).not.toHaveProperty('allowEmailAutoLink');
    expect(configBody.providers[0]).not.toHaveProperty('allowRegistration');
    expect(configBody.providers[0]).not.toHaveProperty('clientSecret');
    expect(configBody.providers[0]).not.toHaveProperty('tokenEndpoint');
    expect(configBody.providers[0]).not.toHaveProperty('jwksUri');
    expect(configBody.providers[0]).not.toHaveProperty('jwks');

    const oidcResponse = await fetch(`${testsBaseUrl}/login/oidc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'local-dev',
        idToken: signIdToken(privateKey)
      })
    });
    expect(oidcResponse.status).toBe(200);
    await expect(oidcResponse.json()).resolves.toMatchObject({
      success: true,
      token: expect.any(String)
    });

    const linked = await tdb.all<{
      provider: string;
      subject: string;
      user_id: number;
    }>('select provider, subject, user_id from user_oidc_accounts');
    expect(linked).toEqual([
      { provider: 'local-dev', subject: 'dev-user-1', user_id: 1 }
    ]);
  });

  test('exchanges an authorization code against a local OIDC provider token endpoint and verifies JWKS over HTTP', async () => {
    const { privateKey, publicProvider } = makeProviderFixture();
    const providerServer = Bun.serve({
      port: 0,
      fetch: async (request) => {
        const url = new URL(request.url);
        if (url.pathname === '/jwks') return Response.json(publicProvider.jwks);
        if (url.pathname === '/token') {
          const form = new URLSearchParams(await request.text());
          if (
            form.get('grant_type') !== 'authorization_code' ||
            form.get('code') !== 'valid-code'
          ) {
            return Response.json({ error: 'invalid_grant' }, { status: 400 });
          }
          return Response.json({
            id_token: signIdToken(privateKey, {
              sub: 'dev-user-code',
              email: 'testowner'
            })
          });
        }
        return new Response('not found', { status: 404 });
      }
    });

    try {
      config.oidc.enabled = true;
      config.oidc.providers = [
        {
          ...publicProvider,
          jwks: undefined,
          jwksUri: `http://127.0.0.1:${providerServer.port}/jwks`,
          tokenEndpoint: `http://127.0.0.1:${providerServer.port}/token`
        }
      ] as never;

      const oidcResponse = await fetch(`${testsBaseUrl}/login/oidc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'local-dev',
          code: 'valid-code',
          redirectUri: 'sharkord://oidc/callback'
        })
      });
      expect(oidcResponse.status).toBe(200);
      await expect(oidcResponse.json()).resolves.toMatchObject({
        success: true,
        token: expect.any(String)
      });
    } finally {
      providerServer.stop(true);
    }
  });

  test('rejects id tokens from the wrong issuer', async () => {
    const { privateKey, publicProvider } = makeProviderFixture();
    config.oidc.enabled = true;
    config.oidc.providers = [publicProvider] as never;

    const oidcResponse = await fetch(`${testsBaseUrl}/login/oidc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'local-dev',
        idToken: signIdToken(privateKey, { iss: 'https://evil.example' })
      })
    });
    expect(oidcResponse.status).toBe(400);
    await expect(oidcResponse.json()).resolves.toMatchObject({
      errors: { oidc: 'OIDC token verification failed' }
    });
  });

  test('desktop capability advertises OIDC login and voice hot-swap support', async () => {
    const { caller } = await initTest(1);
    const capabilities = await caller.desktop.capabilities();
    expect(capabilities.capabilities.oidcLogin).toBe(true);
    expect(capabilities.capabilities.voiceDeviceHotSwap).toBe(true);
  });
});
