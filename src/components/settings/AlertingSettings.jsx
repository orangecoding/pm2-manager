/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, {useState} from 'react';
import {fetchJson} from '../../services/api.js';

/**
 * Available template variables for header values and body values.
 * Shown in the UI as a reference for users building their webhook config.
 */
const TEMPLATE_VARS = [
    {name: '{logLevel}', description: 'Detected log level (e.g. error, warn, info)'},
    {name: '{log_message}', description: 'The full raw log line text'},
    {name: '{process_name}', description: 'The PM2 process name'},
];

const PREVIEW_PAYLOAD = {
    log_level: 'error',
    log: 'Error: 42 is not a number.',
    process_name: 'my-app',
};

/**
 * Substitute template variables with raw sample values.
 *
 * @param {string} template
 * @returns {string}
 */
function previewSubstituteRaw(template) {
    return template
        .replace(/\{logLevel\}/g, PREVIEW_PAYLOAD.log_level)
        .replace(/\{log_message\}/g, PREVIEW_PAYLOAD.log)
        .replace(/\{process_name\}/g, PREVIEW_PAYLOAD.process_name);
}

/**
 * Substitute template variables with JSON-encoded sample values (includes
 * surrounding quotes and escaping).  Used as a second-pass fallback so that
 * unquoted variables inside JSON structures produce valid JSON.
 *
 * @param {string} template
 * @returns {string}
 */
function previewSubstituteJsonEncoded(template) {
    return template
        .replace(/\{logLevel\}/g, JSON.stringify(PREVIEW_PAYLOAD.log_level))
        .replace(/\{log_message\}/g, JSON.stringify(PREVIEW_PAYLOAD.log))
        .replace(/\{process_name\}/g, JSON.stringify(PREVIEW_PAYLOAD.process_name));
}

/**
 * Resolve a single body param value using the same two-pass strategy as the
 * backend: raw substitution first, JSON-encoded substitution as fallback.
 *
 * @param {string} template
 * @returns {unknown}
 */
function resolveBodyValue(template) {
    const raw = previewSubstituteRaw(template);
    try {
        return JSON.parse(raw);
    } catch {
        const encoded = previewSubstituteJsonEncoded(template);
        try {
            return JSON.parse(encoded);
        } catch {
            return raw;
        }
    }
}

/**
 * Build a live curl command preview from the current webhook configuration.
 *
 * @param {string} url
 * @param {{ key: string, value: string }[]} headers
 * @param {{ key: string, value: string }[]} bodyParams
 * @returns {string}
 */
function buildCurlPreview(url, headers, bodyParams) {
    const headerLines = headers
        .filter((h) => h.key && h.key.trim())
        .map((h) => `  -H "${h.key.trim()}: ${previewSubstituteRaw(h.value ?? '')}" \\`)
        .join('\n');

    const bodyObj = {};
    for (const p of bodyParams) {
        if (p.key && p.key.trim()) {
            bodyObj[p.key.trim()] = resolveBodyValue(p.value ?? '');
        }
    }
    const bodyStr = JSON.stringify(bodyObj, null, 2);

    const parts = [`curl -X POST "${url || '<url>'}" \\`, `  -H "Content-Type: application/json" \\`];
    if (headerLines) parts.push(headerLines + ' \\');
    parts.push(`  -d '${bodyStr}'`);

    return parts.join('\n');
}

/**
 * Alerting settings page.
 *
 * Configures when alerts fire and which reporters receive them.
 * Both webhook header values and body values support template variables
 * ({logLevel}, {log_message}, {process_name}) that are substituted at
 * dispatch time with the actual values from the triggering log line.
 *
 * @param {{
 *   settings: Record<string, string>,
 *   onChange: (updated: Record<string, string>) => void,
 *   onSave: () => Promise<void>,
 *   saving: boolean,
 *   saveError: string | null,
 *   csrfToken: string | null,
 *   onCsrfRefresh: () => Promise<void>,
 * }} props
 */
export default function AlertingSettings({settings, onChange, onSave, saving, saveError, csrfToken, onCsrfRefresh}) {
    // Parse current values with defaults.
    const mode = settings['alert.mode'] ?? 'every';
    const throttleMinutes = settings['alert.throttleMinutes'] ?? '60';
    let logLevelThreshold = ['error'];
    try {
        const parsed = JSON.parse(settings['alert.logLevelThreshold'] ?? '["error"]');
        if (Array.isArray(parsed)) logLevelThreshold = parsed;
    } catch {
        // Use default.
    }

    const webhookEnabled = settings['reporter.webhook.enabled'] === '1';
    const webhookUrl = settings['reporter.webhook.url'] ?? '';
    let webhookHeaders = [];
    try {
        const parsed = JSON.parse(settings['reporter.webhook.headers'] ?? '[]');
        if (Array.isArray(parsed)) webhookHeaders = parsed;
    } catch {
        // Use default.
    }
    let webhookBody = [];
    try {
        const parsed = JSON.parse(settings['reporter.webhook.body'] ?? '[]');
        if (Array.isArray(parsed)) webhookBody = parsed;
    } catch {
        // Use default.
    }

    const ntfyEnabled = settings['reporter.ntfy.enabled'] === '1';
    const ntfyServerUrl = settings['reporter.ntfy.serverUrl'] ?? 'https://ntfy.sh';
    const ntfyTopic = settings['reporter.ntfy.topic'] ?? '';
    const ntfyPriority = settings['reporter.ntfy.priority'] ?? 'default';
    const ntfyToken = settings['reporter.ntfy.token'] ?? '';

    const [showNtfyToken, setShowNtfyToken] = useState(false);
    const [webhookTestResult, setWebhookTestResult] = useState(null);
    const [webhookTesting, setWebhookTesting] = useState(false);
    const [ntfyTestResult, setNtfyTestResult] = useState(null);
    const [ntfyTesting, setNtfyTesting] = useState(false);

    /**
     * @param {string} key
     * @param {string} value
     */
    function set(key, value) {
        onChange({...settings, [key]: value});
    }

    function toggleLevel(level) {
        const next = logLevelThreshold.includes(level)
            ? logLevelThreshold.filter((l) => l !== level)
            : [...logLevelThreshold, level];
        set('alert.logLevelThreshold', JSON.stringify(next));
    }

    // Header helpers
    function addWebhookHeader() {
        set('reporter.webhook.headers', JSON.stringify([...webhookHeaders, {key: '', value: ''}]));
    }
    function updateWebhookHeader(index, field, value) {
        const next = webhookHeaders.map((h, i) => (i === index ? {...h, [field]: value} : h));
        set('reporter.webhook.headers', JSON.stringify(next));
    }
    function removeWebhookHeader(index) {
        set('reporter.webhook.headers', JSON.stringify(webhookHeaders.filter((_, i) => i !== index)));
    }

    // Body helpers
    function addWebhookBodyParam() {
        set('reporter.webhook.body', JSON.stringify([...webhookBody, {key: '', value: ''}]));
    }
    function updateWebhookBodyParam(index, field, value) {
        const next = webhookBody.map((p, i) => (i === index ? {...p, [field]: value} : p));
        set('reporter.webhook.body', JSON.stringify(next));
    }
    function removeWebhookBodyParam(index) {
        set('reporter.webhook.body', JSON.stringify(webhookBody.filter((_, i) => i !== index)));
    }

    async function sendWebhookTest() {
        if (!csrfToken) return;
        setWebhookTesting(true);
        setWebhookTestResult(null);
        try {
            const result = await fetchJson('/api/alerting/test/webhook', {
                method: 'POST',
                headers: {'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json'},
                body: JSON.stringify({url: webhookUrl, headers: webhookHeaders, body: webhookBody}),
            });
            await onCsrfRefresh();
            setWebhookTestResult(result);
        } catch (err) {
            setWebhookTestResult({ok: false, error: err.message});
        } finally {
            setWebhookTesting(false);
        }
    }

    async function sendNtfyTest() {
        if (!csrfToken) return;
        setNtfyTesting(true);
        setNtfyTestResult(null);
        try {
            const result = await fetchJson('/api/alerting/test/ntfy', {
                method: 'POST',
                headers: {'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json'},
                body: JSON.stringify({serverUrl: ntfyServerUrl, topic: ntfyTopic, priority: ntfyPriority, token: ntfyToken}),
            });
            await onCsrfRefresh();
            setNtfyTestResult(result);
        } catch (err) {
            setNtfyTestResult({ok: false, error: err.message});
        } finally {
            setNtfyTesting(false);
        }
    }

    return (
        <div>
            <h2 className="settings-page-title">Alerting</h2>

            {saveError && (
                <div className="settings-notice settings-notice--error">{saveError}</div>
            )}

            <p className="settings-section-title">When to alert</p>

            <div className="alert-mode-options">
                <label>
                    <input type="radio" name="alert-mode" value="every" checked={mode === 'every'} onChange={() => set('alert.mode', 'every')}/>
                    Alert on every match
                </label>
                <label>
                    <input type="radio" name="alert-mode" value="throttle" checked={mode === 'throttle'} onChange={() => set('alert.mode', 'throttle')}/>
                    Alert once, then wait
                </label>
            </div>

            {mode === 'throttle' && (
                <div className="throttle-row">
                    <input
                        className="settings-input"
                        type="number"
                        min="1"
                        value={throttleMinutes}
                        onChange={(e) => set('alert.throttleMinutes', e.target.value)}
                    />
                    <span>minutes before alerting again</span>
                </div>
            )}

            <p className="settings-section-title">Log level threshold</p>

            <div className="level-checkboxes">
                {['error', 'warn', 'info', 'debug'].map((level) => (
                    <label key={level}>
                        <input
                            type="checkbox"
                            checked={logLevelThreshold.includes(level)}
                            onChange={() => toggleLevel(level)}
                        />
                        {level}
                    </label>
                ))}
            </div>
            <p className="settings-hint">An alert fires when a log line matches any of the selected levels.</p>

            <p className="settings-section-title">Reporters</p>

            {/* Webhook reporter */}
            <div className="reporter-card">
                <div className="reporter-card-header">
                    <strong>Webhook</strong>
                    <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
                        <input
                            type="checkbox"
                            checked={webhookEnabled}
                            onChange={(e) => set('reporter.webhook.enabled', e.target.checked ? '1' : '0')}
                        />
                        <span className="toggle-track"/>
                        <span className="toggle-label">{webhookEnabled ? 'Enabled' : 'Disabled'}</span>
                    </label>
                </div>
                {webhookEnabled && (
                    <div className="reporter-card-body">
                        <div className="settings-field">
                            <label htmlFor="wh-url">URL</label>
                            <input
                                id="wh-url"
                                className="settings-input"
                                type="url"
                                value={webhookUrl}
                                placeholder="https://hooks.example.com/alert"
                                onChange={(e) => set('reporter.webhook.url', e.target.value)}
                            />
                        </div>

                        <div className="settings-field">
                            <label>Headers</label>
                            {webhookHeaders.map((header, i) => (
                                <div className="header-row" key={i}>
                                    <input
                                        className="settings-input"
                                        placeholder="Header name"
                                        value={header.key}
                                        onChange={(e) => updateWebhookHeader(i, 'key', e.target.value)}
                                    />
                                    <input
                                        className="settings-input"
                                        placeholder="Value"
                                        value={header.value}
                                        onChange={(e) => updateWebhookHeader(i, 'value', e.target.value)}
                                    />
                                    <button type="button" onClick={() => removeWebhookHeader(i)} title="Remove header">x</button>
                                </div>
                            ))}
                            <button type="button" className="add-header-btn" onClick={addWebhookHeader}>
                                + Add header
                            </button>
                        </div>

                        <div className="settings-field">
                            <label>Body params</label>
                            {webhookBody.map((param, i) => (
                                <div className="header-row" key={i}>
                                    <input
                                        className="settings-input"
                                        placeholder="Key"
                                        value={param.key}
                                        onChange={(e) => updateWebhookBodyParam(i, 'key', e.target.value)}
                                    />
                                    <input
                                        className="settings-input"
                                        placeholder="Value"
                                        value={param.value}
                                        onChange={(e) => updateWebhookBodyParam(i, 'value', e.target.value)}
                                    />
                                    <button type="button" onClick={() => removeWebhookBodyParam(i)} title="Remove param">x</button>
                                </div>
                            ))}
                            <button type="button" className="add-header-btn" onClick={addWebhookBodyParam}>
                                + Add body param
                            </button>
                            <p className="settings-hint">
                                Body values are sent as-is when they are plain strings. If a value is valid JSON
                                (object, array, number, boolean) it is embedded directly into the body rather than
                                wrapped in quotes. Variable substitution is applied before JSON parsing.
                                Available variables:
                            </p>
                            <table className="template-vars-table">
                                <tbody>
                                    {TEMPLATE_VARS.map(({name, description}) => (
                                        <tr key={name}>
                                            <td><code>{name}</code></td>
                                            <td>{description}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <p className="curl-preview-label">This is what the POST request will look like:</p>
                        <pre className="curl-preview">{buildCurlPreview(webhookUrl, webhookHeaders, webhookBody)}</pre>

                        <div className="test-row">
                            <button type="button" className="ghost-button" onClick={sendWebhookTest} disabled={webhookTesting || !webhookUrl}>
                                {webhookTesting ? 'Sending...' : 'Send Test'}
                            </button>
                            {webhookTestResult && (
                                <span className={`test-result test-result--${webhookTestResult.ok ? 'ok' : 'error'}`}>
                                    {webhookTestResult.ok
                                        ? `Success (HTTP ${webhookTestResult.status})`
                                        : `Failed: ${webhookTestResult.error ?? `HTTP ${webhookTestResult.status}`}`}
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ntfy reporter */}
            <div className="reporter-card">
                <div className="reporter-card-header">
                    <strong>ntfy</strong>
                    <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
                        <input
                            type="checkbox"
                            checked={ntfyEnabled}
                            onChange={(e) => set('reporter.ntfy.enabled', e.target.checked ? '1' : '0')}
                        />
                        <span className="toggle-track"/>
                        <span className="toggle-label">{ntfyEnabled ? 'Enabled' : 'Disabled'}</span>
                    </label>
                </div>
                {ntfyEnabled && (
                    <div className="reporter-card-body">
                        <div className="settings-field">
                            <label htmlFor="ntfy-server">Server URL</label>
                            <input
                                id="ntfy-server"
                                className="settings-input"
                                type="url"
                                value={ntfyServerUrl}
                                onChange={(e) => set('reporter.ntfy.serverUrl', e.target.value)}
                            />
                        </div>
                        <div className="settings-field">
                            <label htmlFor="ntfy-topic">Topic</label>
                            <input
                                id="ntfy-topic"
                                className="settings-input"
                                value={ntfyTopic}
                                placeholder="my-alerts"
                                onChange={(e) => set('reporter.ntfy.topic', e.target.value)}
                            />
                        </div>
                        <div className="settings-field">
                            <label htmlFor="ntfy-priority">Priority</label>
                            <select
                                id="ntfy-priority"
                                className="settings-select"
                                value={ntfyPriority}
                                onChange={(e) => set('reporter.ntfy.priority', e.target.value)}
                            >
                                <option value="min">min</option>
                                <option value="low">low</option>
                                <option value="default">default</option>
                                <option value="high">high</option>
                                <option value="urgent">urgent</option>
                            </select>
                        </div>
                        <div className="settings-field">
                            <label htmlFor="ntfy-token">Auth token (optional)</label>
                            <div className="token-row">
                                <input
                                    id="ntfy-token"
                                    className="settings-input"
                                    type={showNtfyToken ? 'text' : 'password'}
                                    value={ntfyToken}
                                    placeholder="tk_..."
                                    onChange={(e) => set('reporter.ntfy.token', e.target.value)}
                                    autoComplete="off"
                                />
                                <button
                                    type="button"
                                    className="token-toggle"
                                    onClick={() => setShowNtfyToken((v) => !v)}
                                >
                                    {showNtfyToken ? 'Hide' : 'Show'}
                                </button>
                            </div>
                        </div>

                        <div className="test-row">
                            <button type="button" className="ghost-button" onClick={sendNtfyTest} disabled={ntfyTesting || !ntfyTopic}>
                                {ntfyTesting ? 'Sending...' : 'Send Test'}
                            </button>
                            {ntfyTestResult && (
                                <span className={`test-result test-result--${ntfyTestResult.ok ? 'ok' : 'error'}`}>
                                    {ntfyTestResult.ok
                                        ? `Success (HTTP ${ntfyTestResult.status})`
                                        : `Failed: ${ntfyTestResult.error ?? `HTTP ${ntfyTestResult.status}`}`}
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="settings-save-row">
                <button className="ghost-button" type="button" onClick={onSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
        </div>
    );
}
