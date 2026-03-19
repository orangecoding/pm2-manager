/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Alerting settings schema.
 *
 * Creates the `alerting_settings` key-value table for alerting configuration,
 * and adds the `alerts_enabled` column to `monitored_processes`.
 *
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
  db.exec(`
    CREATE TABLE alerting_settings (
      key        TEXT    PRIMARY KEY,
      value      TEXT    NOT NULL,
      updated_at INTEGER NOT NULL
    );

    ALTER TABLE monitored_processes ADD COLUMN alerts_enabled INTEGER NOT NULL DEFAULT 1;
  `);
}
