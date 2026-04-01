/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React, {useState} from "react";
import Pill from "./Pill.jsx";
import { formatBytes, formatDate, getStatusTone } from "../services/format.js";
import Actions from "./Actions.jsx";

export default function HeroCard({ selectedProcess, details, sseConnected, onLogout, onRestart, onDelete, onRemoveOrphan, selectedDeployment, actions, selectedProcessId, csrfToken, onCsrfRefresh }) {
  const [confirmingRestart, setConfirmingRestart] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingRemoveOrphan, setConfirmingRemoveOrphan] = useState(false);

  const handleRestartClick = () => {
    setConfirmingRestart(true);
  };

  const handleRestartConfirm = async () => {
    setConfirmingRestart(false);
    await onRestart();
  };

  const handleRestartCancel = () => {
    setConfirmingRestart(false);
  };

  const handleDeleteClick = () => {
    setConfirmingDelete(true);
  };

  const handleDeleteConfirm = async (withDeploy) => {
    setConfirmingDelete(false);
    await onDelete(withDeploy);
  };

  const handleDeleteCancel = () => {
    setConfirmingDelete(false);
  };

  const handleRemoveOrphanClick = () => {
    setConfirmingRemoveOrphan(true);
  };

  const handleRemoveOrphanConfirm = async () => {
    setConfirmingRemoveOrphan(false);
    await onRemoveOrphan(selectedProcess.name);
  };

  const handleRemoveOrphanCancel = () => {
    setConfirmingRemoveOrphan(false);
  };

  const isOrphan = selectedProcess?.isOrphan ?? false;
  const isDeletable = !isOrphan && selectedProcess && ['stopped', 'errored', 'error', 'one-launch-status'].includes(selectedProcess.status);

  return (
    <header className="hero-card section-shell">
      <div className="hero-copy">
        <p className="eyebrow">Selected Process</p>
        <h2>{selectedProcess?.name || "No process selected"}</h2>
        <p className="subtle">
          {selectedProcess
            ? `Status: ${selectedProcess.status} · PID: ${details?.process?.pid ?? "n/a"} · Up since: ${details?.process?.uptime ? formatDate(details.process.uptime) : ""}`
            : "Choose a PM2 process from the sidebar."}
        </p>
        <div className="selection-badges">
          {selectedProcess ? (
            <>
              <Pill label={selectedProcess.status || "unknown"} tone={getStatusTone(selectedProcess.status)} />
              <Pill label={`${selectedProcess.cpu}% CPU`} tone="neutral" />
              <Pill label={formatBytes(selectedProcess.memory)} tone="neutral" />
            </>
          ) : (
            <Pill label="Waiting for selection" tone="muted" />
          )}
        </div>
      </div>
      <div className="hero-rail">
        <div className="signal-card">
          <span className={`signal-dot ${sseConnected ? "connected" : "disconnected"}`} />
          <div>
            <span className="signal-label">Live stream</span>
            <strong>{sseConnected ? "Connected" : "Disconnected"}</strong>
          </div>
        </div>
        <div className="hero-actions">
          {confirmingRestart ? (
            <div className="action-confirm">
              <span>Restart <strong>{selectedProcess?.name}</strong>?</span>
              <div className="action-confirm-buttons">
                <button className="btn btn-sm btn-confirm" onClick={handleRestartConfirm}>Yes</button>
                <button className="btn btn-sm btn-cancel" onClick={handleRestartCancel}>No</button>
              </div>
            </div>
          ) : (
            <button className="primary-button" type="button" disabled={!selectedProcess} onClick={handleRestartClick}>Restart process</button>
          )}
          {isOrphan && (
            confirmingRemoveOrphan ? (
              <div className="action-confirm">
                <span>Remove <strong>{selectedProcess?.name}</strong> from hawkeye?</span>
                <div className="action-confirm-buttons">
                  <button className="btn btn-sm btn-confirm" onClick={handleRemoveOrphanConfirm}>Yes</button>
                  <button className="btn btn-sm btn-cancel" onClick={handleRemoveOrphanCancel}>No</button>
                </div>
              </div>
            ) : (
              <button className="ghost-button danger-button" type="button" onClick={handleRemoveOrphanClick}>Remove orphan</button>
            )
          )}
          {isDeletable && (
            confirmingDelete ? (
              <div className="action-confirm">
                <span>Delete <strong>{selectedProcess?.name}</strong> from PM2?</span>
                {selectedDeployment && (
                  <p className="action-confirm-hint">
                    This process was deployed by hawkeye. Also delete the deployment
                    record and the directory on disk ({selectedDeployment.deploy_path})?
                  </p>
                )}
                <div className="action-confirm-buttons">
                  {selectedDeployment ? (
                    <>
                      <button className="btn btn-sm btn-confirm" onClick={() => handleDeleteConfirm(true)}>Yes, incl. disk data</button>
                      <button className="btn btn-sm btn-cancel-soft" onClick={() => handleDeleteConfirm(false)}>Yes, PM2 only</button>
                      <button className="btn btn-sm btn-cancel" onClick={handleDeleteCancel}>No</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-sm btn-confirm" onClick={() => handleDeleteConfirm(false)}>Yes</button>
                      <button className="btn btn-sm btn-cancel" onClick={handleDeleteCancel}>No</button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <button className="ghost-button danger-button" type="button" onClick={handleDeleteClick}>Delete from PM2</button>
            )
          )}
          <button className="ghost-button" type="button" onClick={onLogout}>Sign out</button>
        </div>
        <Actions
            actions={actions}
            selectedProcessId={selectedProcessId}
            csrfToken={csrfToken}
            onCsrfRefresh={onCsrfRefresh}
        />
      </div>
    </header>
  );
}
