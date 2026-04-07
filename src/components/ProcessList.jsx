/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, {useMemo} from 'react';
import {formatBytes, getStatusTone} from '../services/format.js';

/**
 * Sidebar process list.
 *
 * Each process row shows its status, CPU/memory, and a read-only monitoring
 * tag.  Rows are rendered as divs (not buttons) so nested interactive elements
 * are valid HTML.  Monitored processes are visually distinguished; orphaned
 * ones (monitored but absent from PM2) receive a warning tint.  Processes that
 * were deployed via hawkeye show a "Deployed" badge, a Redeploy button, and an
 * Edit button.
 *
 * @param {{
 *   processes: object[],
 *   selectedProcessId: string | null,
 *   status: string,
 *   onSelect: (id: string) => void,
 *   onOpenSettings: () => void,
 *   onOpenDeploy: () => void,
 *   onToggleAlert: (pm2Name: string, currentlyEnabled: boolean) => void,
 *   deployments: object[],
 *   onEditDeployment: (pm2Name: string) => void,
 *   onRemoveOrphan: (pm2Name: string) => void,
 * }} props
 */
export default function ProcessList({processes, selectedProcessId, status, onSelect, onOpenSettings, onOpenDeploy, onToggleAlert, deployments = [], onEditDeployment, onRemoveOrphan}) {
    /** @type {Set<string>} O(1) lookup for deployed process names */
    const deployedNames = useMemo(
        () => new Set(deployments.map((d) => d.pm2_name)),
        [deployments]
    );

    return (
        <aside className="sidebar section-shell">
            <div className="brand-card">
                <p className="eyebrow">PM2 Inventory</p>
                <h1>Command Center</h1>
                <p className="subtle">Monitor processes, inspect logs, and restart services.</p>
            </div>
            <div className="sidebar-toolbar">
                <button className="ghost-button" type="button" onClick={onOpenSettings}>Settings</button>
                <button className="ghost-button" type="button" onClick={onOpenDeploy}>Deploy</button>
                <div className="sidebar-status">{status}</div>
            </div>
            <div className="process-list" role="listbox" aria-label="PM2 processes">
                {processes.length ? processes.map((proc) => {
                    const isSelected = String(proc.id ?? proc.name) === String(selectedProcessId);
                    const monitoredClass = proc.isMonitored ? 'monitored' : '';
                    const orphanClass = proc.isOrphan ? 'orphan' : '';
                    return (
                        <div
                            className={`process-item ${isSelected ? 'active' : ''} ${monitoredClass} ${orphanClass}`.trim()}
                            key={proc.name}
                            role="option"
                            aria-selected={isSelected}
                            tabIndex={0}
                            onClick={() => onSelect(proc.id ?? proc.name)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onSelect(proc.id ?? proc.name);
                                }
                            }}
                        >
                            <div className="process-item-top">
                                <span className="process-item-title">{proc.name}</span>
                                <span className="process-item-controls">
                                    {proc.isMonitored && (
                                        <button
                                            className={`bell-btn${proc.alertsEnabled === false ? ' bell-disabled' : ''}`}
                                            title={proc.alertsEnabled === false
                                                ? 'Alerts muted - click to enable'
                                                : 'Alerts active - click to mute'}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleAlert(proc.name, proc.alertsEnabled ?? true);
                                            }}
                                            aria-label="Toggle alerts"
                                        >
                                            {'\uD83D\uDCE2'}
                                        </button>
                                    )}
                                    <span className={`status-indicator ${getStatusTone(proc.status)}`}/>
                                </span>
                            </div>
                            {(proc.isMonitored || deployedNames.has(proc.name)) && (
                                <div className="monitor-tag-row">
                                    {proc.isMonitored && (
                                        <span className="monitor-tag" title="Metrics and logs are being stored">
                                            <span className="monitor-tag-dot"/>
                                            Monitored
                                        </span>
                                    )}
                                    {deployedNames.has(proc.name) && (
                                        <button
                                            className="edit-deploy-btn"
                                            title="Edit configuration or trigger a redeploy"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEditDeployment(proc.name);
                                            }}
                                        >
                                            Edit / Redeploy
                                        </button>
                                    )}
                                </div>
                            )}
                            <span className="process-item-status">
                                {proc.isOrphan
                                    ?   <button
                                            className="process-item-orphan"
                                            title="Remove monitoring record for this process"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onRemoveOrphan(proc.name);
                                            }}
                                        >
                                            Orphan (Remove)
                                        </button>
                                    : `${proc.status} \u00b7 ${proc.cpu}% CPU \u00b7 ${formatBytes(proc.memory)}`}
                            </span>
                        </div>
                    );
                }) : (
                    <div className="empty-card compact"><p>No PM2 processes found.</p></div>
                )}
            </div>
        </aside>
    );
}
