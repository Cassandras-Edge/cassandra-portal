-- Portal Workbench: projects, membership, service credentials, MCP key metadata
-- Applied via: wrangler d1 execute cassandra-portal --file=src/migrations/001_initial.sql

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'personal',
  owner_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_personal
  ON projects(owner_email) WHERE kind = 'personal';

CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, email)
);

CREATE TABLE IF NOT EXISTS service_credentials (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL,
  credentials_encrypted TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, service_id)
);

CREATE TABLE IF NOT EXISTS mcp_keys (
  key_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mcp_keys_project_service
  ON mcp_keys(project_id, service_id);
