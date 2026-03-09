import { vi } from "vitest";

export function createMockKV(): KVNamespace & { _store: Map<string, string> } {
  const store = new Map<string, string>();

  const kv = {
    _store: store,
    get: vi.fn(async (key: string, opts?: string | Partial<KVNamespaceGetOptions<undefined>>) => {
      const value = store.get(key);
      if (!value) return null;
      if (opts === "json") return JSON.parse(value);
      if (typeof opts === "object" && opts?.type === "json") return JSON.parse(value);
      return value;
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(async () => ({
      keys: Array.from(store.keys()).map((name) => ({ name })),
      list_complete: true,
      cacheStatus: null,
    })),
    getWithMetadata: vi.fn(),
  };

  return kv as unknown as KVNamespace & { _store: Map<string, string> };
}

export function createMockEnv(overrides: Partial<Env> = {}): Env & {
  MCP_KEYS: KVNamespace & { _store: Map<string, string> };
} {
  const env = {
    RUNNER_URL: "https://runner.example.test",
    RUNNER_ADMIN_KEY: "runner-admin-key",
    DOMAIN: "example.com",
    MCP_KEYS: createMockKV(),
    VM_PUSH_URL: "https://metrics.example.test",
    VM_PUSH_CLIENT_ID: "metrics-client-id",
    VM_PUSH_CLIENT_SECRET: "metrics-client-secret",
    ...overrides,
  };

  return env as Env & { MCP_KEYS: KVNamespace & { _store: Map<string, string> } };
}

export function createExecutionCtx(): ExecutionContext & {
  waitUntil: ReturnType<typeof vi.fn>;
  passThroughOnException: ReturnType<typeof vi.fn>;
} {
  const executionCtx = {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    props: {},
  };

  return executionCtx as ExecutionContext & {
    waitUntil: ReturnType<typeof vi.fn>;
    passThroughOnException: ReturnType<typeof vi.fn>;
  };
}

export async function json(response: Response) {
  return (await response.json()) as any;
}

export function createAccessCookie(email = "user@test.com") {
  const payload = btoa(JSON.stringify({ email }));
  return `CF_Authorization=header.${payload}.signature`;
}
