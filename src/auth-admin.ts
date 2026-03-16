import { Hono } from "hono";
import { getUserEmail } from "./auth";

const app = new Hono<{ Bindings: Env }>();

/**
 * Fetch the auth worker via Service Binding (preferred) or fallback to AUTH_URL.
 * Service Binding avoids the same-zone Worker fetch restriction (CF error 1014).
 */
function authFetch(env: Env, path: string, init: RequestInit): Promise<Response> {
  if (env.AUTH_SERVICE) {
    // Service Binding — direct Worker-to-Worker call, no network hop
    return env.AUTH_SERVICE.fetch(new Request(`https://auth-internal${path}`, init));
  }
  // Fallback: external fetch (only works cross-zone or via workers.dev)
  if (env.AUTH_URL) {
    return fetch(`${env.AUTH_URL}${path}`, init);
  }
  return Promise.resolve(Response.json({ error: "Auth service not configured" }, { status: 501 }));
}

/** Proxy a request to the auth worker, adding auth headers. */
async function proxyToAuth(
  c: { env: Env; req: { raw: Request } },
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const authSecret = c.env.AUTH_SECRET;
  if (!authSecret || (!c.env.AUTH_SERVICE && !c.env.AUTH_URL)) {
    return Response.json({ error: "Auth service not configured" }, { status: 501 });
  }

  const email = getUserEmail(c.req.raw);
  if (!email) {
    return Response.json({ error: "authenticated user email required" }, { status: 401 });
  }

  const headers: Record<string, string> = {
    "X-Auth-Secret": authSecret,
    "X-Admin-Email": email,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const resp = await authFetch(c.env, path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await resp.json();
  return Response.json(data, { status: resp.status });
}

// ── Whoami (no admin required on auth worker side) ──

app.get("/api/acl/admin/whoami", async (c) => {
  return proxyToAuth(c, "GET", "/acl/whoami");
});

// ── Users ──

app.get("/api/acl/admin/users", async (c) => {
  return proxyToAuth(c, "GET", "/acl/users");
});

app.put("/api/acl/admin/users/:email", async (c) => {
  const email = c.req.param("email");
  const body = await c.req.json();
  return proxyToAuth(c, "PUT", `/acl/users/${encodeURIComponent(email)}`, body);
});

app.delete("/api/acl/admin/users/:email", async (c) => {
  const email = c.req.param("email");
  return proxyToAuth(c, "DELETE", `/acl/users/${encodeURIComponent(email)}`);
});

// ── Groups ──

app.get("/api/acl/admin/groups", async (c) => {
  return proxyToAuth(c, "GET", "/acl/groups");
});

app.put("/api/acl/admin/groups/:name", async (c) => {
  const name = c.req.param("name");
  const body = await c.req.json();
  return proxyToAuth(c, "PUT", `/acl/groups/${encodeURIComponent(name)}`, body);
});

app.delete("/api/acl/admin/groups/:name", async (c) => {
  const name = c.req.param("name");
  return proxyToAuth(c, "DELETE", `/acl/groups/${encodeURIComponent(name)}`);
});

// ── Domains ──

app.get("/api/acl/admin/domains", async (c) => {
  return proxyToAuth(c, "GET", "/acl/domains");
});

app.put("/api/acl/admin/domains/:domain", async (c) => {
  const domain = c.req.param("domain");
  const body = await c.req.json();
  return proxyToAuth(c, "PUT", `/acl/domains/${encodeURIComponent(domain)}`, body);
});

app.delete("/api/acl/admin/domains/:domain", async (c) => {
  const domain = c.req.param("domain");
  return proxyToAuth(c, "DELETE", `/acl/domains/${encodeURIComponent(domain)}`);
});

// ── Test ──

app.post("/api/acl/admin/test", async (c) => {
  const body = await c.req.json();
  return proxyToAuth(c, "POST", "/acl/test", body);
});

// ── Full policy ──

app.get("/api/acl/admin/policy", async (c) => {
  return proxyToAuth(c, "GET", "/acl/policy");
});

app.put("/api/acl/admin/policy", async (c) => {
  const body = await c.req.json();
  return proxyToAuth(c, "PUT", "/acl/policy", body);
});

export { app as authAdmin };
