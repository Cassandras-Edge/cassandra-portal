import { beforeEach, describe, expect, it, vi } from "vitest";
import { runnerProxy } from "../runner-proxy.js";
import { createExecutionCtx, createMockEnv, json } from "./test-helpers.js";

describe("runnerProxy", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  function request(path: string, init?: RequestInit) {
    const env = createMockEnv();
    const executionCtx = createExecutionCtx();
    const response = runnerProxy.fetch(
      new Request(`https://portal.example.test${path}`, init),
      env,
      executionCtx,
    );

    return { env, executionCtx, response };
  }

  it("lists tenants from the runner admin API", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        tenants: [{ id: "tenant-1", name: "Laptop", namespace: "claude-t-tenant-1", max_sessions: 2 }],
      }),
    );

    const { env, response } = request("/api/tokens");
    const res = await response;
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body).toEqual([
      { id: "tenant-1", name: "Laptop", namespace: "claude-t-tenant-1", max_sessions: 2 },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(`${env.RUNNER_URL}/tenants`, {
      headers: { "X-API-Key": env.RUNNER_ADMIN_KEY },
    });
  });

  it("returns a structured 502 when the runner is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    const { response } = request("/api/tokens");
    const res = await response;
    const body = await json(res);

    expect(res.status).toBe(502);
    expect(body).toEqual({ error: "Runner unavailable" });
  });

  it("creates a tenant with a normalized id", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ id: "my-new-key", name: "My New Key!!", api_key: "cassandra/secret" }),
    );

    const { env, response } = request("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "  My New Key!!  " }),
    });
    const res = await response;
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.id).toBe("my-new-key");
    expect(body.name).toBe("My New Key!!");
    expect(body.api_key).toBe("cassandra/secret");
    expect(body.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(fetchMock).toHaveBeenCalledWith(`${env.RUNNER_URL}/tenants`, {
      method: "POST",
      headers: {
        "X-API-Key": env.RUNNER_ADMIN_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: "my-new-key", name: "My New Key!!" }),
    });
  });

  it("rejects names that become empty after trimming", async () => {
    const { response } = request("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "   " }),
    });
    const res = await response;
    const body = await json(res);

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "name is required" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an error when the normalized tenant id would be empty", async () => {
    const { response } = request("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "!!!" }),
    });
    const res = await response;
    const body = await json(res);

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "name must contain letters or numbers" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces upstream error messages from tenant creation", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "tenant already exists" }, { status: 409 }),
    );

    const { response } = request("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Existing" }),
    });
    const res = await response;
    const body = await json(res);

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "tenant already exists" });
  });

  it("deletes tenants through the runner admin API", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));

    const { env, response } = request("/api/tokens/tenant-1", { method: "DELETE" });
    const res = await response;
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(`${env.RUNNER_URL}/tenants/tenant-1`, {
      method: "DELETE",
      headers: { "X-API-Key": env.RUNNER_ADMIN_KEY },
    });
  });
});
