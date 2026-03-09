import { Hono } from "hono";
import { pushMetrics, counter } from "cassandra-observability";

interface McpKeyMeta {
  name: string;
  service: string;
  created_at: string;
  created_by: string;
  credentials?: Record<string, string>;
}

interface CredentialField {
  key: string;
  label: string;
  required: boolean;
}

interface McpService {
  id: string;
  name: string;
  description: string;
  status: "active" | "planned";
  credentialsSchema?: CredentialField[];
}

// Registry of available MCP services (add new services here)
const MCP_SERVICES: McpService[] = [
  {
    id: "yt-mcp",
    name: "yt-mcp",
    description: "Video & Audio Transcription",
    status: "active",
  },
  {
    id: "pushover",
    name: "pushover",
    description: "Push Notifications",
    status: "active",
    credentialsSchema: [
      { key: "pushover_user_key", label: "Pushover User Key", required: true },
      { key: "pushover_api_token", label: "Pushover API Token", required: true },
    ],
  },
];

const app = new Hono<{ Bindings: Env }>();

// List available MCP services
app.get("/api/mcp-services", (c) => {
  return c.json(MCP_SERVICES);
});

// List keys, optionally filtered by service
app.get("/api/mcp-keys", async (c) => {
  const userEmail = getUserEmail(c.req.raw);
  if (!userEmail) return c.json({ error: "authenticated user email is required" }, 401);

  const service = c.req.query("service");
  const list = await c.env.MCP_KEYS.list();
  const keys: Array<{
    key: string;
    name: string;
    service: string;
    created_at: string;
    created_by: string;
    has_credentials: boolean;
  }> = [];

  for (const item of list.keys) {
    const meta = await c.env.MCP_KEYS.get<McpKeyMeta>(item.name, "json");
    if (meta) {
      if (meta.created_by !== userEmail) continue;
      if (service && meta.service !== service) continue;
      keys.push({
        key: item.name,
        name: meta.name,
        service: meta.service,
        created_at: meta.created_at,
        created_by: meta.created_by,
        has_credentials: !!meta.credentials && Object.keys(meta.credentials).length > 0,
      });
    }
  }

  return c.json(keys);
});

app.post("/api/mcp-keys", async (c) => {
  const userEmail = getUserEmail(c.req.raw);
  if (!userEmail) return c.json({ error: "authenticated user email is required" }, 401);

  const body = await c.req.json<{ name?: string; service?: string; credentials?: Record<string, string> }>();
  const name = body.name?.trim();
  const service = body.service?.trim();
  if (!name) return c.json({ error: "name is required" }, 400);
  if (!service) return c.json({ error: "service is required" }, 400);

  const validService = MCP_SERVICES.find((s) => s.id === service);
  if (!validService) return c.json({ error: "unknown service" }, 400);

  // Validate credentials against schema if the service requires them
  if (validService.credentialsSchema) {
    const creds = body.credentials || {};
    for (const field of validService.credentialsSchema) {
      if (field.required && !creds[field.key]?.trim()) {
        return c.json({ error: `${field.label} is required` }, 400);
      }
    }
  }

  const key = `mcp_${randomHex(32)}`;
  const meta: McpKeyMeta = {
    name,
    service,
    created_at: new Date().toISOString(),
    created_by: userEmail,
  };

  // Store credentials if provided and service has a schema
  if (validService.credentialsSchema && body.credentials) {
    // Only store fields defined in the schema
    const sanitized: Record<string, string> = {};
    for (const field of validService.credentialsSchema) {
      if (body.credentials[field.key]) {
        sanitized[field.key] = body.credentials[field.key];
      }
    }
    if (Object.keys(sanitized).length > 0) {
      meta.credentials = sanitized;
    }
  }

  await c.env.MCP_KEYS.put(key, JSON.stringify(meta));

  c.executionCtx.waitUntil(
    pushMetrics(c.env, [
      counter("mcp_key_operations_total", 1, { operation: "create", service: meta.service }),
    ]),
  );

  return c.json({
    key,
    name: meta.name,
    service: meta.service,
    created_at: meta.created_at,
  });
});

app.delete("/api/mcp-keys/:key", async (c) => {
  const userEmail = getUserEmail(c.req.raw);
  if (!userEmail) return c.json({ error: "authenticated user email is required" }, 401);

  const key = c.req.param("key");
  if (!key.startsWith("mcp_")) return c.json({ error: "invalid key" }, 400);

  const existing = await c.env.MCP_KEYS.get(key);
  if (!existing) return c.json({ error: "key not found" }, 404);

  const meta = JSON.parse(existing) as McpKeyMeta;
  if (meta.created_by !== userEmail) {
    return c.json({ error: "forbidden" }, 403);
  }
  await c.env.MCP_KEYS.delete(key);

  c.executionCtx.waitUntil(
    pushMetrics(c.env, [
      counter("mcp_key_operations_total", 1, { operation: "delete", service: meta.service }),
    ]),
  );

  return c.json({ ok: true });
});

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getUserEmail(request: Request): string {
  const headerEmail =
    request.headers.get("Cf-Access-Authenticated-User-Email")?.trim() ||
    request.headers.get("X-Auth-Request-Email")?.trim();
  if (headerEmail) return headerEmail;

  try {
    const jwt = request.headers.get("Cf-Access-Jwt-Assertion") || getCookie(request, "CF_Authorization");
    if (jwt) {
      const payload = parseJwtPayload(jwt);
      if (typeof payload.email === "string" && payload.email.trim()) {
        return payload.email.trim();
      }
    }
  } catch {
    // ignore
  }
  return "";
}

function getCookie(request: Request, name: string): string | null {
  const cookies = request.headers.get("Cookie");
  if (!cookies) return null;

  for (const chunk of cookies.split(";")) {
    const trimmed = chunk.trim();
    if (!trimmed.startsWith(`${name}=`)) continue;
    return trimmed.slice(name.length + 1);
  }

  return null;
}

function parseJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split(".");
  if (parts.length < 2) throw new Error("invalid jwt");
  return JSON.parse(decodeBase64Url(parts[1])) as Record<string, unknown>;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const padded = padding === 0 ? normalized : normalized + "=".repeat(4 - padding);
  return atob(padded);
}

export { app as mcpKeys };
