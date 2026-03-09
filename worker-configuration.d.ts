declare namespace Cloudflare {
  interface Env {
    RUNNER_URL: string;
    RUNNER_ADMIN_KEY: string;
    DOMAIN: string;
    MCP_KEYS: KVNamespace;
    PORTAL_DB: D1Database;
    CREDENTIALS_KEY: string;
    VM_PUSH_URL: string;
    VM_PUSH_CLIENT_ID: string;
    VM_PUSH_CLIENT_SECRET: string;
  }
}

interface Env extends Cloudflare.Env {}
