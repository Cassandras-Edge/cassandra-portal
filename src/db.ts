/**
 * D1 helpers and AES-GCM credential encryption for the portal.
 */

// ── ID generation ──

export function generateId(): string {
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── AES-GCM credential encryption ──

async function deriveKey(secret: string): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(secret.padEnd(32, "0").slice(0, 32));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encrypt(plaintext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(encoded: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

// ── Project queries ──

export interface ProjectRow {
  id: string;
  name: string;
  kind: "personal" | "shared";
  owner_email: string;
  created_at: string;
  updated_at: string;
}

export interface MemberRow {
  project_id: string;
  email: string;
  role: "owner" | "member";
  created_at: string;
}

export interface ServiceCredentialRow {
  project_id: string;
  service_id: string;
  credentials_encrypted: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface McpKeyRow {
  key_id: string;
  project_id: string;
  service_id: string;
  name: string;
  created_by: string;
  created_at: string;
}

/** Get or auto-create the user's Personal project. */
export async function ensurePersonalProject(db: D1Database, email: string): Promise<ProjectRow> {
  const existing = await db
    .prepare("SELECT * FROM projects WHERE owner_email = ? AND kind = 'personal'")
    .bind(email)
    .first<ProjectRow>();

  if (existing) return existing;

  const id = generateId();
  await db
    .prepare("INSERT INTO projects (id, name, kind, owner_email) VALUES (?, 'Personal', 'personal', ?)")
    .bind(id, email)
    .run();

  // Also add owner as member
  await db
    .prepare("INSERT INTO project_members (project_id, email, role) VALUES (?, ?, 'owner')")
    .bind(id, email)
    .run();

  return {
    id,
    name: "Personal",
    kind: "personal",
    owner_email: email,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** List all projects the user is a member of. */
export async function listUserProjects(db: D1Database, email: string): Promise<ProjectRow[]> {
  const { results } = await db
    .prepare(
      `SELECT p.* FROM projects p
       JOIN project_members pm ON p.id = pm.project_id
       WHERE pm.email = ?
       ORDER BY p.kind ASC, p.name ASC`,
    )
    .bind(email)
    .all<ProjectRow>();

  return results;
}

/** Check if user is a member of a project and return their role. */
export async function getMemberRole(
  db: D1Database,
  projectId: string,
  email: string,
): Promise<"owner" | "member" | null> {
  const row = await db
    .prepare("SELECT role FROM project_members WHERE project_id = ? AND email = ?")
    .bind(projectId, email)
    .first<{ role: string }>();

  return (row?.role as "owner" | "member") ?? null;
}

/** Get project by ID. */
export async function getProject(db: D1Database, projectId: string): Promise<ProjectRow | null> {
  return db.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first<ProjectRow>();
}

/** List members of a project. */
export async function listMembers(db: D1Database, projectId: string): Promise<MemberRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM project_members WHERE project_id = ? ORDER BY role ASC, email ASC")
    .bind(projectId)
    .all<MemberRow>();

  return results;
}

/** List MCP keys for a project+service from D1. */
export async function listProjectServiceKeys(
  db: D1Database,
  projectId: string,
  serviceId: string,
): Promise<McpKeyRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM mcp_keys WHERE project_id = ? AND service_id = ? ORDER BY created_at DESC")
    .bind(projectId, serviceId)
    .all<McpKeyRow>();

  return results;
}

/** Get service credential metadata (not the decrypted value). */
export async function getServiceCredentialMeta(
  db: D1Database,
  projectId: string,
  serviceId: string,
): Promise<{ has_credentials: boolean; updated_at: string | null; updated_by: string | null }> {
  const row = await db
    .prepare("SELECT updated_at, updated_by FROM service_credentials WHERE project_id = ? AND service_id = ?")
    .bind(projectId, serviceId)
    .first<{ updated_at: string; updated_by: string }>();

  return {
    has_credentials: !!row,
    updated_at: row?.updated_at ?? null,
    updated_by: row?.updated_by ?? null,
  };
}

/** Get decrypted service credentials. */
export async function getDecryptedCredentials(
  db: D1Database,
  projectId: string,
  serviceId: string,
  credentialsKey: string,
): Promise<Record<string, string> | null> {
  const row = await db
    .prepare("SELECT credentials_encrypted FROM service_credentials WHERE project_id = ? AND service_id = ?")
    .bind(projectId, serviceId)
    .first<{ credentials_encrypted: string }>();

  if (!row) return null;

  const json = await decrypt(row.credentials_encrypted, credentialsKey);
  return JSON.parse(json) as Record<string, string>;
}

/** Sync credentials to all KV keys for a project+service. */
export async function syncCredentialsToKV(
  db: D1Database,
  kv: KVNamespace,
  projectId: string,
  serviceId: string,
  credentials: Record<string, string> | null,
): Promise<void> {
  const keys = await listProjectServiceKeys(db, projectId, serviceId);

  for (const key of keys) {
    const existing = await kv.get(key.key_id, "json");
    if (!existing) continue;

    const meta = existing as Record<string, unknown>;
    if (credentials) {
      meta.credentials = credentials;
    } else {
      delete meta.credentials;
    }
    await kv.put(key.key_id, JSON.stringify(meta));
  }
}
