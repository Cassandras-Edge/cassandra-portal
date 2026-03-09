import { describe, it, expect, vi } from "vitest";
import { createAccessCookie, createExecutionCtx, createMockEnv } from "./test-helpers.js";

// Mock cassandra-observability before importing the module
vi.mock("cassandra-observability", () => ({
  pushMetrics: vi.fn(),
  counter: vi.fn(),
}));

const { mcpKeys } = await import("../mcp-keys.js");

function createApp(env: ReturnType<typeof createMockEnv>, email = "user@test.com") {
  return {
    async request(path: string, init?: RequestInit) {
      const headers = new Headers(init?.headers);
      if (!headers.has("Cookie")) headers.set("Cookie", createAccessCookie(email));
      const req = new Request(`http://localhost${path}`, { ...init, headers });
      return mcpKeys.fetch(req, env, createExecutionCtx());
    },
  };
}

describe("GET /api/mcp-services", () => {
  it("returns the service registry with credentialsSchema", async () => {
    const env = createMockEnv();
    const app = createApp(env);

    const res = await app.request("/api/mcp-services");
    const data = await res.json() as any[];

    expect(res.status).toBe(200);
    expect(data).toBeInstanceOf(Array);

    const ytMcp = data.find((s: any) => s.id === "yt-mcp");
    expect(ytMcp).toBeDefined();
    expect(ytMcp.credentialsSchema).toBeUndefined();

    const pushover = data.find((s: any) => s.id === "pushover");
    expect(pushover).toBeDefined();
    expect(pushover.credentialsSchema).toHaveLength(2);
    expect(pushover.credentialsSchema[0].key).toBe("pushover_user_key");
    expect(pushover.credentialsSchema[1].key).toBe("pushover_api_token");
  });
});

describe("POST /api/mcp-keys", () => {
  it("creates a key for a service without credentials", async () => {
    const env = createMockEnv();
    const app = createApp(env);

    const res = await app.request("/api/mcp-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test-key", service: "yt-mcp" }),
    });

    const data = await res.json() as any;
    expect(res.status).toBe(200);
    expect(data.key).toMatch(/^mcp_/);
    expect(data.name).toBe("test-key");
    expect(data.service).toBe("yt-mcp");
    const stored = JSON.parse(env.MCP_KEYS._store.get(data.key)!);
    expect(stored.created_by).toBe("user@test.com");
  });

  it("creates a key with credentials for pushover", async () => {
    const env = createMockEnv();
    const app = createApp(env);

    const res = await app.request("/api/mcp-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "my-pushover",
        service: "pushover",
        credentials: {
          pushover_user_key: "u_abc123",
          pushover_api_token: "a_xyz789",
        },
      }),
    });

    const data = await res.json() as any;
    expect(res.status).toBe(200);
    expect(data.key).toMatch(/^mcp_/);
    expect(data.name).toBe("my-pushover");

    // Verify credentials are stored in KV
    const stored = JSON.parse(env.MCP_KEYS._store.values().next().value!);
    expect(stored.credentials).toEqual({
      pushover_user_key: "u_abc123",
      pushover_api_token: "a_xyz789",
    });
  });

  it("rejects pushover key missing required credentials", async () => {
    const env = createMockEnv();
    const app = createApp(env);

    const res = await app.request("/api/mcp-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "my-pushover",
        service: "pushover",
        // no credentials
      }),
    });

    const data = await res.json() as any;
    expect(res.status).toBe(400);
    expect(data.error).toContain("Pushover User Key");
  });

  it("rejects pushover key with partial credentials", async () => {
    const env = createMockEnv();
    const app = createApp(env);

    const res = await app.request("/api/mcp-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "my-pushover",
        service: "pushover",
        credentials: {
          pushover_user_key: "u_abc123",
          // missing pushover_api_token
        },
      }),
    });

    const data = await res.json() as any;
    expect(res.status).toBe(400);
    expect(data.error).toContain("Pushover API Token");
  });

  it("does not store credentials for services without schema", async () => {
    const env = createMockEnv();
    const app = createApp(env);

    const res = await app.request("/api/mcp-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "test-key",
        service: "yt-mcp",
        credentials: { some_random_field: "should-be-ignored" },
      }),
    });

    const data = await res.json() as any;
    expect(res.status).toBe(200);

    const stored = JSON.parse(env.MCP_KEYS._store.values().next().value!);
    expect(stored.credentials).toBeUndefined();
  });

  it("only stores schema-defined credential fields", async () => {
    const env = createMockEnv();
    const app = createApp(env);

    const res = await app.request("/api/mcp-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "my-pushover",
        service: "pushover",
        credentials: {
          pushover_user_key: "u_abc",
          pushover_api_token: "a_xyz",
          extra_field: "should-be-stripped",
        },
      }),
    });

    expect(res.status).toBe(200);

    const stored = JSON.parse(env.MCP_KEYS._store.values().next().value!);
    expect(stored.credentials).toEqual({
      pushover_user_key: "u_abc",
      pushover_api_token: "a_xyz",
    });
    expect(stored.credentials.extra_field).toBeUndefined();
  });

  it("rejects unknown service", async () => {
    const env = createMockEnv();
    const app = createApp(env);

    const res = await app.request("/api/mcp-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test", service: "nonexistent" }),
    });

    expect(res.status).toBe(400);
  });

  it("rejects missing name", async () => {
    const env = createMockEnv();
    const app = createApp(env);

    const res = await app.request("/api/mcp-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: "yt-mcp" }),
    });

    expect(res.status).toBe(400);
  });

  it("rejects blank names after trimming", async () => {
    const env = createMockEnv();
    const app = createApp(env);

    const res = await app.request("/api/mcp-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "   ", service: "yt-mcp" }),
    });

    const data = await res.json() as any;
    expect(res.status).toBe(400);
    expect(data.error).toBe("name is required");
  });
});

describe("GET /api/mcp-keys", () => {
  it("returns has_credentials but not credential values", async () => {
    const env = createMockEnv();
    const app = createApp(env);

    // Seed a key with credentials
    env.MCP_KEYS._store.set("mcp_test123", JSON.stringify({
      name: "test-key",
      service: "pushover",
      created_at: "2026-01-01",
      created_by: "user@test.com",
      credentials: {
        pushover_user_key: "u_secret",
        pushover_api_token: "a_secret",
      },
    }));

    const res = await app.request("/api/mcp-keys");
    const data = await res.json() as any[];

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].has_credentials).toBe(true);
    // Must NOT leak credential values
    expect(data[0].credentials).toBeUndefined();
    expect(data[0].pushover_user_key).toBeUndefined();
    expect(data[0].pushover_api_token).toBeUndefined();
  });

  it("returns has_credentials=false for keys without credentials", async () => {
    const env = createMockEnv();
    const app = createApp(env);

    env.MCP_KEYS._store.set("mcp_basic", JSON.stringify({
      name: "basic-key",
      service: "yt-mcp",
      created_at: "2026-01-01",
      created_by: "user@test.com",
    }));

    const res = await app.request("/api/mcp-keys");
    const data = await res.json() as any[];

    expect(data[0].has_credentials).toBe(false);
  });

  it("filters by service", async () => {
    const env = createMockEnv();
    const app = createApp(env);

    env.MCP_KEYS._store.set("mcp_a", JSON.stringify({
      name: "key-a", service: "yt-mcp", created_at: "2026-01-01", created_by: "user@test.com",
    }));
    env.MCP_KEYS._store.set("mcp_b", JSON.stringify({
      name: "key-b", service: "pushover", created_at: "2026-01-01", created_by: "user@test.com",
    }));

    const res = await app.request("/api/mcp-keys?service=pushover");
    const data = await res.json() as any[];

    expect(data).toHaveLength(1);
    expect(data[0].service).toBe("pushover");
  });

  it("only returns keys owned by the signed-in user", async () => {
    const env = createMockEnv();
    const app = createApp(env, "alice@example.com");

    env.MCP_KEYS._store.set("mcp_alice", JSON.stringify({
      name: "alice-key",
      service: "pushover",
      created_at: "2026-01-01",
      created_by: "alice@example.com",
    }));
    env.MCP_KEYS._store.set("mcp_bob", JSON.stringify({
      name: "bob-key",
      service: "pushover",
      created_at: "2026-01-01",
      created_by: "bob@example.com",
    }));

    const res = await app.request("/api/mcp-keys");
    const data = await res.json() as any[];

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe("alice-key");
  });

  it("rejects list requests without an authenticated user", async () => {
    const env = createMockEnv();
    const app = createApp(env);

    const res = await app.request("/api/mcp-keys", {
      headers: { Cookie: "" },
    });

    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/mcp-keys/:key", () => {
  it("deletes an existing key", async () => {
    const env = createMockEnv();
    const app = createApp(env);

    env.MCP_KEYS._store.set("mcp_todelete", JSON.stringify({
      name: "delete-me", service: "yt-mcp", created_at: "2026-01-01", created_by: "user@test.com",
    }));

    const res = await app.request("/api/mcp-keys/mcp_todelete", { method: "DELETE" });
    const data = await res.json() as any;

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
  });

  it("rejects non-mcp_ keys", async () => {
    const env = createMockEnv();
    const app = createApp(env);

    const res = await app.request("/api/mcp-keys/bad_key", { method: "DELETE" });
    expect(res.status).toBe(400);
  });

  it("returns 404 for nonexistent key", async () => {
    const env = createMockEnv();
    const app = createApp(env);

    const res = await app.request("/api/mcp-keys/mcp_nonexistent", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("rejects deleting another user's key", async () => {
    const env = createMockEnv();
    const app = createApp(env, "alice@example.com");

    env.MCP_KEYS._store.set("mcp_todelete", JSON.stringify({
      name: "delete-me",
      service: "yt-mcp",
      created_at: "2026-01-01",
      created_by: "bob@example.com",
    }));

    const res = await app.request("/api/mcp-keys/mcp_todelete", { method: "DELETE" });
    const data = await res.json() as any;

    expect(res.status).toBe(403);
    expect(data.error).toBe("forbidden");
    expect(env.MCP_KEYS._store.has("mcp_todelete")).toBe(true);
  });

  it("rejects create requests without an authenticated user", async () => {
    const env = createMockEnv();
    const app = createApp(env);

    const res = await app.request("/api/mcp-keys", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "",
      },
      body: JSON.stringify({ name: "test-key", service: "yt-mcp" }),
    });

    expect(res.status).toBe(401);
  });
});
