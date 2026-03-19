/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, {useEffect, useState} from 'react';
import {fetchJson} from '../../services/api.js';

/**
 * Env keys that are password fields and should always render as type="password".
 */
const PASSWORD_KEYS = new Set(['AUTH_PASSWORD_SALT', 'AUTH_PASSWORD_HASH']);

/**
 * General settings page.
 *
 * Reads all KEY=VALUE pairs from the .env file on the server (via
 * GET /api/settings/general) and renders a dynamic form - one input per key.
 * Sensitive keys (AUTH_PASSWORD_SALT, AUTH_PASSWORD_HASH) are never returned
 * by the server. A dedicated "Change password" field handles password updates.
 *
 * On save, the raw env key names and their new values are sent to
 * POST /api/settings/general, which writes them back to .env on disk.
 *
 * @param {{
 *   csrfToken: string | null,
 *   onCsrfRefresh: () => Promise<void>,
 * }} props
 */
export default function GeneralSettings({csrfToken, onCsrfRefresh}) {
    const [fields, setFields] = useState(null);
    const [loading, setLoading] = useState(true);
    const [newPassword, setNewPassword] = useState('');
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState(null);

    // Fetch current .env values on mount.
    useEffect(() => {
        fetchJson('/api/settings/general')
            .then((payload) => {
                setFields(payload.settings ?? {});
            })
            .catch((err) => {
                setNotice({type: 'error', text: `Failed to load settings: ${err.message}`});
            })
            .finally(() => setLoading(false));
    }, []);

    /**
     * @param {string} key
     * @param {string} value
     */
    function set(key, value) {
        setFields((prev) => ({...prev, [key]: value}));
    }

    async function handleSave(e) {
        e.preventDefault();
        if (!csrfToken || !fields) return;
        setSaving(true);
        setNotice(null);
        try {
            const settings = {...fields};
            if (newPassword.trim()) {
                settings.authPassword = newPassword.trim();
            }
            await fetchJson('/api/settings/general', {
                method: 'POST',
                headers: {'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json'},
                body: JSON.stringify({settings}),
            });
            await onCsrfRefresh();
            setNotice({type: 'success', text: 'Saved - please restart pm2-manager for changes to take effect.'});
            setNewPassword('');
        } catch (err) {
            setNotice({type: 'error', text: err.message ?? 'Save failed.'});
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div>
                <h2 className="settings-page-title">General Settings</h2>
                <p className="settings-hint">Loading...</p>
            </div>
        );
    }

    const keys = fields ? Object.keys(fields) : [];

    return (
        <form onSubmit={handleSave}>
            <h2 className="settings-page-title">General Settings</h2>

            <div className="settings-notice">
                Changes are written to your .env file. A restart of pm2-manager is required for them to take effect.
            </div>

            {notice && (
                <div className={`settings-notice settings-notice--${notice.type}`}>
                    {notice.text}
                </div>
            )}

            {keys.length === 0 && (
                <p className="settings-hint">No .env file found. Fields will be created when you save.</p>
            )}

            {keys.map((key) => (
                <div className="settings-field" key={key}>
                    <label htmlFor={`gs-${key}`}>{key}</label>
                    <input
                        id={`gs-${key}`}
                        className="settings-input"
                        type={PASSWORD_KEYS.has(key) ? 'password' : 'text'}
                        value={fields[key] ?? ''}
                        onChange={(e) => set(key, e.target.value)}
                        autoComplete="off"
                    />
                </div>
            ))}

            <p className="settings-section-title">Change Password</p>
            <div className="settings-field">
                <label htmlFor="gs-new-password">New password</label>
                <input
                    id="gs-new-password"
                    className="settings-input"
                    type="password"
                    value={newPassword}
                    placeholder="Leave blank to keep current"
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                />
                <p className="settings-hint">
                    A new salt and hash will be derived automatically. The plaintext password is never stored.
                </p>
            </div>

            <div className="settings-save-row">
                <button className="ghost-button" type="submit" disabled={saving || loading}>
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
        </form>
    );
}
