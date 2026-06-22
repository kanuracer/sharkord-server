import { describe, expect, test } from 'bun:test';
import { initTest, login } from '../../__tests__/helpers';
import { testsBaseUrl } from '../../__tests__/setup';

describe('OIDC first pass', () => {
  test('advertises disabled OIDC config by default and rejects OIDC login without breaking local breakglass login', async () => {
    const configResponse = await fetch(`${testsBaseUrl}/auth/oidc/config`);
    expect(configResponse.status).toBe(200);
    await expect(configResponse.json()).resolves.toMatchObject({ enabled: false, providers: [] });

    const oidcResponse = await fetch(`${testsBaseUrl}/login/oidc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'default', idToken: 'not-a-token' })
    });
    expect(oidcResponse.status).toBe(400);
    await expect(oidcResponse.json()).resolves.toMatchObject({ errors: { oidc: 'OIDC login is not enabled' } });

    const localResponse = await login('testowner', 'password123');
    expect(localResponse.status).toBe(200);
    await expect(localResponse.json()).resolves.toHaveProperty('token');
  });

  test('desktop capability advertises OIDC login and voice hot-swap support', async () => {
    const { caller } = await initTest(1);
    const capabilities = await caller.desktop.capabilities();
    expect(capabilities.capabilities.oidcLogin).toBe(true);
    expect(capabilities.capabilities.voiceDeviceHotSwap).toBe(true);
  });
});
