import { Hono } from "hono";
import { pushMetrics, counter } from "cassandra-observability";
import { runnerProxy } from "./runner-proxy";
import { mcpKeys } from "./mcp-keys";
import { projects } from "./projects";
import { credentials } from "./credentials";

const app = new Hono<{ Bindings: Env }>();

// Metrics middleware — track all requests
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  const path = new URL(c.req.url).pathname;
  const isApi = path.startsWith("/api/");
  c.executionCtx.waitUntil(
    pushMetrics(c.env, [
      counter("mcp_requests_total", 1, {
        service: "portal",
        status: String(c.res.status),
        path: isApi ? path : "/",
      }),
      counter("mcp_request_duration_ms_total", duration, {
        service: "portal",
        path: isApi ? path : "/",
      }),
    ]),
  );
});

// Public config (no secrets — just the domain for link generation)
app.get("/api/config", (c) => {
  return c.json({ domain: c.env.DOMAIN || "" });
});

// Mount API routes
app.route("/", runnerProxy);
app.route("/", mcpKeys);
app.route("/", projects);
app.route("/", credentials);

// For non-API routes, static assets are served by Workers Static Assets (assets.directory in wrangler.jsonc).
// This catch-all returns index.html for SPA client-side routing.
app.all("*", async (c) => {
  // If ASSETS binding exists (Workers Static Assets), serve index.html for SPA routes
  const assets = (c.env as unknown as Record<string, unknown>).ASSETS as { fetch: (req: Request) => Promise<Response> } | undefined;
  if (assets) {
    const url = new URL(c.req.url);
    url.pathname = "/index.html";
    return assets.fetch(new Request(url.toString(), c.req.raw));
  }
  // Fallback: minimal HTML pointing to dev server
  return c.html("<!DOCTYPE html><html><body><p>Frontend not built. Run <code>cd frontend && npm run dev</code></p></body></html>");
});

export default app;
