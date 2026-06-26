import { describe, expect, test } from 'bun:test';
import permissions from '../i18n/locales/en/permissions.json';

describe('security audit permissions UI source', () => {
  test('renders dedicated security permissions and DM pin labels', () => {
    expect(permissions.server.PIN_DIRECT_MESSAGES).toBeTruthy();
    expect(permissions.serverDescriptions.PIN_DIRECT_MESSAGES).toBeTruthy();
    expect(permissions.server.VIEW_AUDIT_LOG).toBeTruthy();
    expect(permissions.serverDescriptions.VIEW_AUDIT_LOG).toBeTruthy();
    expect(permissions.server.MANAGE_SECURITY_EVENTS).toBeTruthy();
    expect(permissions.serverDescriptions.MANAGE_SECURITY_EVENTS).toBeTruthy();
  });
});
