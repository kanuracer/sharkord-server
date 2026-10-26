import { describe, expect, test } from 'bun:test';
import { assertBuildRuntime } from '../../../build/runtime';

describe('standalone build runtime floor', () => {
  test('rejects affected and unversioned builders', () => {
    for (const version of [
      '1.0.21',
      '1.3.14',
      '1.4.3',
      '1.4.4-beta.1',
      'invalid'
    ]) {
      expect(() => assertBuildRuntime(version)).toThrow();
    }
  });

  test('accepts the fixed runtime and compatible updates', () => {
    expect(() => assertBuildRuntime('1.4.4')).not.toThrow();
    expect(() => assertBuildRuntime('1.4.5')).not.toThrow();
    expect(() => assertBuildRuntime()).not.toThrow();
  });
});
