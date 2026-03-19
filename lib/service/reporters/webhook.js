/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Webhook reporter.
 *
 * Sends alert payloads as HTTP POST requests with a JSON body assembled from
 * user-configured key/value body params.  Both header values and body values
 * support variable substitution:
 *
 *   {logLevel}      - the detected log level (e.g. 'error', 'warn')
 *   {log_message}   - the raw log line text
 *   {process_name}  - the PM2 process name
 *
 * A 5-second timeout is enforced via AbortController.
 */

/**
 * @typedef {Object} AlertPayload
 * @property {string} log_level
 * @property {string} log
 * @property {string} time
 * @property {string} process_name
 */

/**
 * @typedef {Object} WebhookConfig
 * @property {string} url
 * @property {{ key: string, value: string }[]} headers
 * @property {{ key: string, value: string }[]} body
 */

/**
 * Replace template variables in a string with raw (unescaped) values from the
 * alert payload.
 *
 * Supported variables: {logLevel}, {log_message}, {process_name}.
 *
 * @param {string} template
 * @param {AlertPayload} payload
 * @returns {string}
 */
function substituteVars(template, payload) {
  return template
    .replace(/\{logLevel\}/g, payload.log_level)
    .replace(/\{log_message\}/g, payload.log)
    .replace(/\{process_name\}/g, payload.process_name);
}

/**
 * Replace template variables with JSON-encoded values (including surrounding
 * quotes and proper escaping).  Used as a second-pass fallback when the user
 * places an unquoted variable directly inside a JSON structure:
 *
 *   `{"msg": {log_message}}` → `{"msg": "Error: connection refused"}`
 *
 * @param {string} template
 * @param {AlertPayload} payload
 * @returns {string}
 */
function substituteVarsJsonEncoded(template, payload) {
  return template
    .replace(/\{logLevel\}/g, JSON.stringify(payload.log_level))
    .replace(/\{log_message\}/g, JSON.stringify(payload.log))
    .replace(/\{process_name\}/g, JSON.stringify(payload.process_name));
}

/**
 * Build the request headers object from config, applying variable substitution
 * to header values.
 *
 * @param {{ key: string, value: string }[]} headerConfig
 * @param {AlertPayload} payload
 * @returns {Record<string, string>}
 */
function buildHeaders(headerConfig, payload) {
  /** @type {Record<string, string>} */
  const headers = { 'Content-Type': 'application/json' };
  if (Array.isArray(headerConfig)) {
    for (const h of headerConfig) {
      if (h.key && h.key.trim()) {
        headers[h.key.trim()] = substituteVars(h.value ?? '', payload);
      }
    }
  }
  return headers;
}

/**
 * Build the JSON body object from user-configured key/value body params.
 *
 * Two-pass JSON resolution per value:
 *   1. Substitute variables with raw values, attempt JSON.parse.
 *      Handles already-quoted variables: `{"msg": "{log_message}"}`.
 *   2. If pass 1 fails, substitute variables with JSON-encoded values
 *      (adds surrounding quotes and escaping), attempt JSON.parse again.
 *      Handles unquoted variables inside JSON: `{"msg": {log_message}}`.
 *   3. If both fail, keep the raw substituted string.
 *
 * This allows plain strings, numbers, booleans, arrays, and nested objects
 * as values - with or without template variables.
 *
 * @param {{ key: string, value: string }[]} bodyConfig
 * @param {AlertPayload} payload
 * @returns {Record<string, unknown>}
 */
function buildBody(bodyConfig, payload) {
  /** @type {Record<string, unknown>} */
  const body = {};
  if (Array.isArray(bodyConfig)) {
    for (const p of bodyConfig) {
      if (p.key && p.key.trim()) {
        const raw = substituteVars(p.value ?? '', payload);
        try {
          body[p.key.trim()] = JSON.parse(raw);
        } catch {
          // Second pass: re-substitute with JSON-encoded values so that
          // unquoted variables inside JSON structures become valid tokens.
          const encoded = substituteVarsJsonEncoded(p.value ?? '', payload);
          try {
            body[p.key.trim()] = JSON.parse(encoded);
          } catch {
            body[p.key.trim()] = raw;
          }
        }
      }
    }
  }
  return body;
}

/**
 * POST an alert payload to a webhook URL.
 *
 * The request body is assembled from `config.body` key/value pairs with
 * variable substitution applied.  Header values also support substitution.
 *
 * @param {WebhookConfig} config
 * @param {AlertPayload} payload
 * @returns {Promise<void>}
 */
export async function sendWebhook(config, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: buildHeaders(config.headers, payload),
      body: JSON.stringify(buildBody(config.body, payload)),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Webhook responded with HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Send a sample test payload to a webhook and return a result object.
 *
 * Uses a synthetic payload so the test can be triggered from the settings UI
 * without requiring a real log event.
 *
 * @param {WebhookConfig} config
 * @returns {Promise<{ ok: boolean, status?: number, error?: string }>}
 */
export async function testWebhook(config) {
  /** @type {AlertPayload} */
  const samplePayload = {
    log_level: 'error',
    process_name: 'test-process',
    log: 'Error: this is a test alert from pm2-manager',
    time: new Date().toISOString(),
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    let response;
    try {
      response = await fetch(config.url, {
        method: 'POST',
        headers: buildHeaders(config.headers, samplePayload),
        body: JSON.stringify(buildBody(config.body, samplePayload)),
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
