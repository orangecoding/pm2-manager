/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Unit tests for alertingService.js.
 *
 * Uses the optional `_reporters` injection parameter to avoid triggering
 * real HTTP requests and to control which reporters are enabled.
 */

import { strict as assert } from 'node:assert';
import { evaluateAndDispatch } from '../lib/service/alertingService.js';
import { setSetting, setSettings } from '../lib/storage/alertingSettingsStorage.js';
import { addMonitored, setAlertsEnabled } from '../lib/storage/monitoringStorage.js';
import { getDb } from '../lib/storage/db.js';

/** Remove all rows from alerting and monitoring tables between tests. */
function cleanDb() {
  const db = getDb();
  db.prepare('DELETE FROM alerting_settings').run();
  db.prepare('DELETE FROM log_entries').run();
  db.prepare('DELETE FROM metrics_history').run();
  db.prepare('DELETE FROM monitored_processes').run();
}

/**
 * Build a mock reporter that records calls.
 *
 * @param {object} [configOverride]
 * @returns {{ send: Function, config: object, calls: object[] }}
 */
function mockReporter(configOverride = {}) {
  const calls = [];
  return {
    name: 'mock',
    config: configOverride,
    send: async (_config, payload) => {
      calls.push(payload);
    },
    calls,
  };
}

describe('alertingService', () => {
  beforeEach(() => {
    cleanDb();
    // Default: error threshold, every mode.
    setSettings({
      'alert.mode': 'every',
      'alert.logLevelThreshold': '["error"]',
    });
    // Add a default monitored process.
    addMonitored('test-app');
  });

  it('does not dispatch when no reporters are provided', async () => {
    await evaluateAndDispatch('test-app', 'error', 'boom', []);
    // No assertion needed - just must not throw.
  });

  it('does not dispatch when getAlertsEnabled is false', async () => {
    setAlertsEnabled('test-app', false);
    const reporter = mockReporter();
    await evaluateAndDispatch('test-app', 'error', 'boom', [reporter]);
    assert.strictEqual(reporter.calls.length, 0);
  });

  it('does not dispatch when log level is not in threshold', async () => {
    const reporter = mockReporter();
    await evaluateAndDispatch('test-app', 'info', 'informational message', [reporter]);
    assert.strictEqual(reporter.calls.length, 0);
  });

  it('dispatches when log level is in threshold', async () => {
    const reporter = mockReporter();
    await evaluateAndDispatch('test-app', 'error', 'something broke', [reporter]);
    assert.strictEqual(reporter.calls.length, 1);
    assert.strictEqual(reporter.calls[0].log_level, 'error');
    assert.strictEqual(reporter.calls[0].process_name, 'test-app');
    assert.strictEqual(reporter.calls[0].log, 'something broke');
  });

  it('dispatches for both error and warn with multi-value threshold', async () => {
    setSetting('alert.logLevelThreshold', '["error","warn"]');
    const reporter = mockReporter();

    await evaluateAndDispatch('test-app', 'error', 'error line', [reporter]);
    await evaluateAndDispatch('test-app', 'warn', 'warn line', [reporter]);

    assert.strictEqual(reporter.calls.length, 2);
    assert.strictEqual(reporter.calls[0].log_level, 'error');
    assert.strictEqual(reporter.calls[1].log_level, 'warn');
  });

  it('uses "info" as effective level when logLevel is null', async () => {
    setSetting('alert.logLevelThreshold', '["info"]');
    const reporter = mockReporter();
    await evaluateAndDispatch('test-app', null, 'no level line', [reporter]);
    assert.strictEqual(reporter.calls.length, 1);
    assert.strictEqual(reporter.calls[0].log_level, 'info');
  });

  describe('throttle mode', () => {
    // Use a unique process name per throttle test to avoid shared throttle state.
    it('first call dispatches; second call within window is skipped', async () => {
      addMonitored('throttle-app-1');
      setSettings({
        'alert.mode': 'throttle',
        'alert.throttleMinutes': '60',
        'alert.logLevelThreshold': '["error"]',
      });
      const reporter = mockReporter();

      await evaluateAndDispatch('throttle-app-1', 'error', 'first', [reporter]);
      await evaluateAndDispatch('throttle-app-1', 'error', 'second', [reporter]);

      assert.strictEqual(reporter.calls.length, 1, 'only the first call should dispatch');
    });

    it('every mode dispatches on every qualifying call', async () => {
      addMonitored('every-app-1');
      setSettings({
        'alert.mode': 'every',
        'alert.logLevelThreshold': '["error"]',
      });
      const reporter = mockReporter();

      await evaluateAndDispatch('every-app-1', 'error', 'first', [reporter]);
      await evaluateAndDispatch('every-app-1', 'error', 'second', [reporter]);

      assert.strictEqual(reporter.calls.length, 2);
    });
  });

  it('reporter promise rejection is caught and does not throw', async () => {
    const failingReporter = {
      name: 'failing',
      config: {},
      send: async () => {
        throw new Error('network timeout');
      },
    };
    // Must not throw.
    await evaluateAndDispatch('test-app', 'error', 'boom', [failingReporter]);
  });

  it('payload has expected fields', async () => {
    const reporter = mockReporter();
    const before = Date.now();
    await evaluateAndDispatch('test-app', 'error', 'test log text', [reporter]);
    const after = Date.now();

    const payload = reporter.calls[0];
    assert.strictEqual(payload.log_level, 'error');
    assert.strictEqual(payload.log, 'test log text');
    assert.strictEqual(payload.process_name, 'test-app');

    const payloadTime = new Date(payload.time).getTime();
    assert.ok(payloadTime >= before && payloadTime <= after, 'time should be close to now');
  });
});
