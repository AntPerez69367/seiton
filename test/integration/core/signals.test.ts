import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerCleanup,
  isShuttingDown,
  resetSignalState,
  getRegisteredHandlerCount,
} from '../../../src/core/signals.js';

describe('Signal handling', () => {
  afterEach(() => {
    resetSignalState();
  });

  describe('registerCleanup', () => {
    it('registers a cleanup function', () => {
      let called = false;
      registerCleanup(async () => { called = true; });
      assert.equal(called, false);
    });

    it('returns an unregister function', () => {
      let called = false;
      const unregister = registerCleanup(async () => { called = true; });
      unregister();
      assert.equal(called, false);
    });
  });

  describe('isShuttingDown', () => {
    it('returns false initially', () => {
      assert.equal(isShuttingDown(), false);
    });
  });

  describe('resetSignalState', () => {
    it('clears all registered handlers', () => {
      registerCleanup(async () => {});
      registerCleanup(async () => {});
      assert.equal(getRegisteredHandlerCount(), 2);
      resetSignalState();
      assert.equal(getRegisteredHandlerCount(), 0);
      assert.equal(isShuttingDown(), false);
    });
  });
});
