/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * ntfy reporter.
 *
 * Sends alert payloads to a ntfy server as plain-text push notifications.
 * The message body is truncated to 4000 characters to stay within ntfy limits.
 */

/**
 * @typedef {Object} AlertPayload
 * @property {string} log_level
 * @property {string} log
 * @property {string} time
 * @property {string} process_name
 */

/**
 * @typedef {Object} NtfyConfig
 * @property {string} serverUrl
 * @property {string} topic
 * @property {string} priority
 * @property {string} [token]
 */

const MAX_MESSAGE_LENGTH = 4000;

/**
 * Build the ntfy request headers from config.
 *
 * @param {NtfyConfig} config
 * @param {string} title
 * @returns {Record<string, string>}
 */
function buildHeaders(config, title) {
  /** @type {Record<string, string>} */
  const headers = {
    'Content-Type': 'text/plain',
    Title: title,
    Priority: config.priority || 'default',
    Tags: 'warning',
  };
  if (config.token && config.token.trim()) {
    headers['Authorization'] = `Bearer ${config.token.trim()}`;
  }
  return headers;
}

/**
 * POST an alert payload to a ntfy server.
 *
 * @param {NtfyConfig} config
 * @param {AlertPayload} payload
 * @returns {Promise<void>}
 */
export async function sendNtfy(config, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  const title = `[${payload.log_level.toUpperCase()}] ${payload.process_name}`;
  const body = `${payload.time}\n${payload.log}`.slice(0, MAX_MESSAGE_LENGTH);
  const url = `${config.serverUrl.replace(/\/$/, '')}/${config.topic}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(config, title),
      body,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`ntfy responded with HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Send a sample test notification to ntfy and return a result object.
 *
 * @param {NtfyConfig} config
 * @returns {Promise<{ ok: boolean, status?: number, error?: string }>}
 */
export async function testNtfy(config) {
  const samplePayload = {
    log_level: 'error',
    process_name: 'test-process',
    log: 'Error: this is a test alert from pm2-hawkeye',
    time: new Date().toISOString(),
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const title = `[${samplePayload.log_level.toUpperCase()}] ${samplePayload.process_name}`;
    const body = `${samplePayload.time}\n${samplePayload.log}`.slice(0, MAX_MESSAGE_LENGTH);
    const url = `${config.serverUrl.replace(/\/$/, '')}/${config.topic}`;

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: buildHeaders(config, title),
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.ok) {
      return { ok: true, status: response.status };
    }
    return { ok: false, status: response.status, error: `HTTP ${response.status}` };
  } catch (err) {
    return { ok: false, error: err.message ?? String(err) };
  }
}
