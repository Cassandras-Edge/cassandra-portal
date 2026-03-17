-- Per-vault MCP server configuration
-- Applied via: wrangler d1 execute cassandra-portal --file=src/migrations/003_vault_mcp_servers.sql
-- Column was added in pipeline 44. This is a no-op to avoid duplicate column errors.
-- Original: ALTER TABLE runner_vaults ADD COLUMN mcp_servers_encrypted TEXT;

SELECT 1;
