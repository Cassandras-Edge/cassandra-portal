import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAccessCookie, createExecutionCtx, createMockEnv, json } from "./test-helpers.js";

vi.mock("cassandra-observability", () => ({
  pushMetrics: vi.fn(async () => undefined),
  counter: vi.fn((name: string, value: number, labels: Record<string, string>) => ({
    name,
    value,
    labels,
  })),
}));

const { default: app } = await import("../index.js");
const { counter, pushMetrics } = await import("cassandra-observability");

describe("portal worker integration", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  async function request(
    path: string,
    init?: RequestInit,
    env = createMockEnv(),
    executionCtx = createExecutionCtx(),
  ) {
    const response = await app.fetch(
      new Request(`https://portal.example.test${path}`, init),
      env,
      executionCtx,
    );

    return { env, executionCtx, response };
  }

  it("serves the HTML shell for non-API routes and records root metrics labels", async () => {
    const { executionCtx, response } = await request("/dashboard");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Cassandra Portal");
    expect(html).toContain("example.com");
    expect(counter).toHaveBeenNthCalledWith(1, "mcp_requests_total", 1, {
      service: "portal",
      status: "200",
      path: "/",
    });
    expect(counter).toHaveBeenNthCalledWith(2, "mcp_request_duration_ms_total", expect.any(Number), {
      service: "portal",
      path: "/",
    });
    expect(pushMetrics).toHaveBeenCalledTimes(1);
    expect(executionCtx.waitUntil).toHaveBeenCalledTimes(1);
  });

  it("routes runner token requests through the mounted proxy and preserves API path labels", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        tenants: [{ id: "tenant-1", name: "Ops", namespace: "claude-t-tenant-1", max_sessions: 3 }],
      }),
    );

    const { env, response } = await request("/api/tokens");
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(`${env.RUNNER_URL}/tenants`, {
      headers: { "X-API-Key": env.RUNNER_ADMIN_KEY },
    });
    expect(counter).toHaveBeenNthCalledWith(1, "mcp_requests_total", 1, {
      service: "portal",
      status: "200",
      path: "/api/tokens",
    });
    expect(counter).toHaveBeenNthCalledWith(2, "mcp_request_duration_ms_total", expect.any(Number), {
      service: "portal",
      path: "/api/tokens",
    });
  });

  it("persists MCP key metadata, hides credentials on list, and emits both request and key-operation metrics", async () => {
    const env = createMockEnv();
    const executionCtx = createExecutionCtx();

    const createResponse = await app.fetch(
      new Request("https://portal.example.test/api/mcp-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: createAccessCookie("ops@example.com"),
        },
        body: JSON.stringify({
          name: "Pager",
          service: "pushover",
          credentials: {
            pushover_user_key: "user-key",
            pushover_api_token: "api-token",
            extra_field: "ignore-me",
          },
        }),
      }),
      env,
      executionCtx,
    );
    const created = await json(createResponse);

    expect(createResponse.status).toBe(200);
    expect(created.service).toBe("pushover");
    expect(created.key).toMatch(/^mcp_/);

    const stored = JSON.parse(env.MCP_KEYS._store.get(created.key)!);
    expect(stored).toMatchObject({
      name: "Pager",
      service: "pushover",
      created_by: "ops@example.com",
      credentials: {
        pushover_user_key: "user-key",
        pushover_api_token: "api-token",
      },
    });
    expect(stored.credentials.extra_field).toBeUndefined();
    expect(executionCtx.waitUntil).toHaveBeenCalledTimes(2);
    expect(pushMetrics).toHaveBeenCalledTimes(2);
    expect(pushMetrics).toHaveBeenCalledWith(env, [
      {
        name: "mcp_key_operations_total",
        value: 1,
        labels: { operation: "create", service: "pushover" },
      },
    ]);

    const listResponse = await app.fetch(
      new Request("https://portal.example.test/api/mcp-keys?service=pushover", {
        headers: {
          Cookie: createAccessCookie("ops@example.com"),
        },
      }),
      env,
      createExecutionCtx(),
    );
    const keys = await json(listResponse);

    expect(listResponse.status).toBe(200);
    expect(keys).toEqual([
      expect.objectContaining({
        key: created.key,
        name: "Pager",
        service: "pushover",
        created_by: "ops@example.com",
        has_credentials: true,
      }),
    ]);
    expect(keys[0].credentials).toBeUndefined();
    expect(keys[0].pushover_user_key).toBeUndefined();
  });

  it("hides another user's MCP keys from the signed-in account", async () => {
    const env = createMockEnv();

    env.MCP_KEYS._store.set("mcp_alice", JSON.stringify({
      name: "Alice Pager",
      service: "pushover",
      created_at: "2026-01-01T00:00:00.000Z",
      created_by: "alice@example.com",
    }));
    env.MCP_KEYS._store.set("mcp_bob", JSON.stringify({
      name: "Bob Pager",
      service: "pushover",
      created_at: "2026-01-01T00:00:00.000Z",
      created_by: "bob@example.com",
    }));

    const response = await app.fetch(
      new Request("https://portal.example.test/api/mcp-keys?service=pushover", {
        headers: {
          Cookie: createAccessCookie("alice@example.com"),
        },
      }),
      env,
      createExecutionCtx(),
    );
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body).toEqual([
      expect.objectContaining({
        key: "mcp_alice",
        name: "Alice Pager",
        created_by: "alice@example.com",
      }),
    ]);
  });
});
