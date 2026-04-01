/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Deployments schema.
 *
 * Creates the `deployments` table that stores per-app GitHub deployment
 * configuration managed through the UI.
 *
 * @param {import('better-sqlite3').Database} db
 */
export function up(db) {
  db.exec(`
    CREATE TABLE deployments (
      id                TEXT    PRIMARY KEY,
      pm2_name          TEXT    NOT NULL UNIQUE,
      repo_url          TEXT    NOT NULL,
      branch            TEXT    NOT NULL DEFAULT 'main',
      deploy_path       TEXT    NOT NULL,
      start_script      TEXT    NOT NULL DEFAULT 'index.js',
      install_cmd       TEXT    NOT NULL DEFAULT 'npm install',
      build_cmd         TEXT,
      pre_setup_script  TEXT,
      post_setup_script TEXT,
      env_vars          TEXT    NOT NULL DEFAULT '{}',
      pm2_options       TEXT    NOT NULL DEFAULT '{}',
      deploying         INTEGER NOT NULL DEFAULT 0,
      created_at        INTEGER NOT NULL,
      last_deployed_at  INTEGER
    )
  `);
}
