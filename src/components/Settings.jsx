/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, {useCallback, useEffect, useState} from 'react';
import {fetchJson} from '../services/api.js';
import GeneralSettings from './settings/GeneralSettings.jsx';
import AlertingSettings from './settings/AlertingSettings.jsx';

const PAGES = ['General', 'Alerting'];

/**
 * Full-screen settings overlay.
 *
 * Closes on Escape key or backdrop click. Shows an unsaved-changes warning
 * if the user attempts to close while there are uncommitted alerting changes.
 *
 * @param {{
 *   onClose: () => void,
 *   csrfToken: string | null,
 *   onCsrfRefresh: () => Promise<void>,
 * }} props
 */
export default function Settings({onClose, csrfToken, onCsrfRefresh}) {
    const [activePage, setActivePage] = useState('General');
    const [alertingSettings, setAlertingSettings] = useState({});
    const [alertingSettingsLoaded, setAlertingSettingsLoaded] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Load alerting settings once on mount.
    useEffect(() => {
        fetchJson('/api/alerting/settings')
            .then((payload) => {
                setAlertingSettings(payload.settings ?? {});
                setAlertingSettingsLoaded(true);
            })
            .catch(() => {
                setAlertingSettingsLoaded(true);
            });
    }, []);

    // Close on Escape key.
    useEffect(() => {
        /**
         * @param {KeyboardEvent} e
         */
        function onKeyDown(e) {
            if (e.key === 'Escape') handleClose();
        }
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    });

    /**
     * Attempt to close; warn if there are unsaved changes.
     */
    const handleClose = useCallback(() => {
        if (isDirty) {
            if (!window.confirm('You have unsaved alerting changes. Close without saving?')) return;
        }
        onClose();
    }, [isDirty, onClose]);

    /**
     * Handle alerting settings form changes.
     *
     * @param {Record<string, string>} updated
     */
    function handleAlertingChange(updated) {
        setAlertingSettings(updated);
        setIsDirty(true);
        setSaveSuccess(false);
    }

    /**
     * Save alerting settings to the backend.
     */
    async function handleAlertingSave() {
        if (!csrfToken) return;
        setSaving(true);
        setSaveError(null);
        setSaveSuccess(false);
        try {
            await fetchJson('/api/alerting/settings', {
                method: 'POST',
                headers: {'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json'},
                body: JSON.stringify({settings: alertingSettings}),
            });
            await onCsrfRefresh();
            setIsDirty(false);
            setSaveSuccess(true);
        } catch (err) {
            setSaveError(err.message ?? 'Save failed.');
        } finally {
            setSaving(false);
        }
    }

    /**
     * Handle backdrop click - close only if clicking the backdrop itself.
     *
     * @param {React.MouseEvent} e
     */
    function handleOverlayClick(e) {
        if (e.target === e.currentTarget) handleClose();
    }

    return (
        <div className="settings-overlay" onClick={handleOverlayClick} role="dialog" aria-modal="true" aria-label="Settings">
            <div className="settings-modal">
                <nav className="settings-sidebar">
                    <p className="settings-sidebar-title">Settings</p>
                    {PAGES.map((page) => (
                        <button
                            key={page}
                            className={`settings-nav-item${activePage === page ? ' active' : ''}`}
                            type="button"
                            onClick={() => setActivePage(page)}
                        >
                            {page}
                        </button>
                    ))}
                    <div className="settings-sidebar-close">
                        <button type="button" onClick={handleClose}>Close</button>
                    </div>
                </nav>

                <div className="settings-body">
                    {saveSuccess && activePage === 'Alerting' && (
                        <div className="settings-notice settings-notice--success">
                            Alerting settings saved successfully.
                        </div>
                    )}

                    {activePage === 'General' && (
                        <GeneralSettings
                            csrfToken={csrfToken}
                            onCsrfRefresh={onCsrfRefresh}
                        />
                    )}

                    {activePage === 'Alerting' && alertingSettingsLoaded && (
                        <AlertingSettings
                            settings={alertingSettings}
                            onChange={handleAlertingChange}
                            onSave={handleAlertingSave}
                            saving={saving}
                            saveError={saveError}
                            csrfToken={csrfToken}
                            onCsrfRefresh={onCsrfRefresh}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
