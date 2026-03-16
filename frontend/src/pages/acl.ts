import * as api from "../api";
import { h, btn, pill, emptyState } from "../components/ui";

let currentTab: "users" | "groups" | "domains" | "test" = "users";
let expandedId: string | null = null;

// Cached data
let cachedGroups: Record<string, api.AclGroupEntry> = {};
let cachedServices: api.McpService[] = [];

export async function renderAclPage(root: HTMLElement) {
  root.innerHTML = "";
  const container = h("div", { className: "p-6 max-w-[900px]" });

  // ── Header ──
  const header = h("div", { className: "mb-5" });
  header.appendChild(h("h1", { className: "text-xl font-semibold mb-1" }, "Access Control"));
  const meta = h("div", { className: "flex items-center gap-3 text-xs text-text-2" });
  meta.appendChild(pill("Active", "ok"));
  meta.appendChild(h("span", {}, "Manage users, groups, domains, and test access policies"));
  header.appendChild(meta);
  container.appendChild(header);

  // ── Tabs ──
  const tabs = h("div", { className: "flex gap-0.5 mb-4" });
  const tabDefs: { id: typeof currentTab; label: string }[] = [
    { id: "users", label: "Users" },
    { id: "groups", label: "Groups" },
    { id: "domains", label: "Domains" },
    { id: "test", label: "Test Access" },
  ];
  for (const tab of tabDefs) {
    const tabBtn = h("button", {
      className: `px-4 py-2 rounded-md text-xs transition-all font-[family-name:var(--font-sans)] ${
        currentTab === tab.id
          ? "bg-accent-soft text-accent font-medium"
          : "text-text-2 hover:bg-surface-3 hover:text-text-1"
      }`,
    }, tab.label);
    tabBtn.addEventListener("click", () => {
      currentTab = tab.id;
      expandedId = null;
      renderAclPage(root);
    });
    tabs.appendChild(tabBtn);
  }
  container.appendChild(tabs);

  // Pre-fetch shared data
  try {
    [cachedGroups, cachedServices] = await Promise.all([
      api.aclAdmin.groups.list(),
      api.services.list(),
    ]);
  } catch { /* use cached or empty */ }

  // ── Tab Content ──
  try {
    if (currentTab === "users") {
      await renderUsersTab(container, root);
    } else if (currentTab === "groups") {
      await renderGroupsTab(container, root);
    } else if (currentTab === "domains") {
      await renderDomainsTab(container, root);
    } else {
      await renderTestTab(container);
    }
  } catch (e) {
    container.appendChild(h("div", { className: "bg-danger-soft border border-danger/20 rounded-lg p-4 text-[12.5px] text-danger" },
      `Failed to load ACL data: ${(e as Error).message}`));
  }

  root.appendChild(container);
}

// ═══════════════════════════════════════
// Users Tab
// ═══════════════════════════════════════

async function renderUsersTab(container: HTMLElement, root: HTMLElement) {
  const users = await api.aclAdmin.users.list();
  const entries = Object.entries(users);
  const groupNames = Object.keys(cachedGroups);

  const bar = h("div", { className: "flex justify-between items-center mb-3" });
  bar.appendChild(h("span", { className: "text-xs text-text-3" }, `${entries.length} user${entries.length !== 1 ? "s" : ""}`));
  bar.appendChild(btn("+ Add User", {
    size: "sm",
    onClick: () => { expandedId = expandedId === "new-user" ? null : "new-user"; renderAclPage(root); },
  }));
  container.appendChild(bar);

  const list = h("div", { className: "flex flex-col gap-px bg-edge border border-edge rounded-lg overflow-hidden" });

  // New user form
  if (expandedId === "new-user") {
    list.appendChild(buildUserForm(root, groupNames));
  }

  for (const [email, user] of entries) {
    const rowId = `user-${email}`;
    const isExpanded = expandedId === rowId;

    // Row
    const row = h("div", {
      className: `flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isExpanded ? "bg-surface-1" : "bg-surface-2 hover:bg-surface-3"}`,
    });
    row.appendChild(h("span", { className: "font-mono text-[11.5px] font-medium min-w-[200px]" }, email));
    row.appendChild(h("span", {
      className: `text-[11px] px-2 py-0.5 rounded-full font-medium ${user.role === "admin" ? "bg-accent-soft text-accent" : "bg-surface-4 text-text-2"}`,
    }, user.role || "user"));
    const groupsDiv = h("div", { className: "flex gap-1 flex-wrap flex-1" });
    for (const g of user.groups || []) {
      groupsDiv.appendChild(pill(g, "neutral"));
    }
    row.appendChild(groupsDiv);
    row.appendChild(h("span", { className: `text-text-3 transition-transform text-base ${isExpanded ? "rotate-90" : ""}` }, "\u203A"));
    row.addEventListener("click", () => { expandedId = isExpanded ? null : rowId; renderAclPage(root); });
    list.appendChild(row);

    // Expand panel
    if (isExpanded) {
      list.appendChild(buildUserForm(root, groupNames, email, user));
    }
  }

  if (entries.length === 0 && expandedId !== "new-user") {
    container.appendChild(emptyState("No users configured."));
  } else {
    container.appendChild(list);
  }
}

function buildUserForm(root: HTMLElement, groupNames: string[], existingEmail?: string, existing?: api.AclUserEntry): HTMLElement {
  const panel = h("div", { className: "bg-surface-1 px-4 pb-4" });
  const inner = h("div", { className: "bg-surface-2 border border-edge rounded-lg p-4" });

  // Email
  if (!existingEmail) {
    const emailInput = document.createElement("input");
    emailInput.className = inputClass;
    emailInput.placeholder = "user@example.com";
    emailInput.id = "acl-email-input";
    inner.appendChild(fieldBlock("Email", emailInput));
  }

  // Role
  const roleSelect = document.createElement("select");
  roleSelect.className = inputClass;
  roleSelect.id = "acl-role-select";
  for (const role of ["user", "admin"]) {
    const opt = document.createElement("option");
    opt.value = role;
    opt.textContent = role;
    if (existing?.role === role) opt.selected = true;
    roleSelect.appendChild(opt);
  }
  inner.appendChild(fieldBlock("Role", roleSelect));

  // Groups — chip selector
  inner.appendChild(fieldBlock("Groups", buildChipSelect(groupNames, existing?.groups || [], "acl-groups")));

  // Actions
  const actions = h("div", { className: "flex items-center gap-2 pt-3 mt-3 border-t border-edge" });
  if (existingEmail) {
    actions.appendChild(btn("Delete User", {
      variant: "danger", size: "sm",
      onClick: async () => {
        if (!confirm(`Remove "${existingEmail}" from ACL?`)) return;
        await api.aclAdmin.users.remove(existingEmail);
        expandedId = null;
        renderAclPage(root);
      },
    }));
  }
  actions.appendChild(h("div", { className: "flex-1" }));
  actions.appendChild(btn("Cancel", { variant: "outline", size: "sm", onClick: () => { expandedId = null; renderAclPage(root); } }));
  actions.appendChild(btn(existingEmail ? "Save" : "Add User", {
    size: "sm",
    onClick: async () => {
      const email = existingEmail || (document.getElementById("acl-email-input") as HTMLInputElement)?.value.trim().toLowerCase();
      if (!email) return;
      const role = (document.getElementById("acl-role-select") as HTMLSelectElement).value as "admin" | "user";
      const groups = getSelectedChips("acl-groups");
      const userData: api.AclUserEntry = { role };
      if (groups.length > 0) userData.groups = groups;
      await api.aclAdmin.users.upsert(email, userData);
      expandedId = null;
      renderAclPage(root);
    },
  }));
  inner.appendChild(actions);
  panel.appendChild(inner);
  return panel;
}

// ═══════════════════════════════════════
// Groups Tab
// ═══════════════════════════════════════

async function renderGroupsTab(container: HTMLElement, root: HTMLElement) {
  const groups = cachedGroups;
  const entries = Object.entries(groups);

  const bar = h("div", { className: "flex justify-between items-center mb-3" });
  bar.appendChild(h("span", { className: "text-xs text-text-3" }, `${entries.length} group${entries.length !== 1 ? "s" : ""}`));
  bar.appendChild(btn("+ Add Group", {
    size: "sm",
    onClick: () => { expandedId = expandedId === "new-group" ? null : "new-group"; renderAclPage(root); },
  }));
  container.appendChild(bar);

  const list = h("div", { className: "flex flex-col gap-px bg-edge border border-edge rounded-lg overflow-hidden" });

  if (expandedId === "new-group") {
    list.appendChild(buildGroupForm(root));
  }

  for (const [name, group] of entries) {
    const rowId = `group-${name}`;
    const isExpanded = expandedId === rowId;
    const svcNames = Object.keys(group.services);
    const denyCount = svcNames.reduce((sum, svc) => sum + (group.services[svc].tools?.deny?.length || 0), 0);

    const row = h("div", {
      className: `flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isExpanded ? "bg-surface-1" : "bg-surface-2 hover:bg-surface-3"}`,
    });
    row.appendChild(h("span", { className: "text-[12px] font-medium min-w-[120px]" }, name));
    const svcDiv = h("div", { className: "flex gap-1 flex-wrap flex-1" });
    for (const svc of svcNames) {
      const access = group.services[svc].access || "deny";
      svcDiv.appendChild(pill(`${svc}: ${access}`, access === "allow" ? "ok" : "neutral"));
    }
    row.appendChild(svcDiv);
    if (denyCount > 0) {
      row.appendChild(h("span", { className: "text-[11px] text-warn" }, `${denyCount} denied`));
    } else {
      row.appendChild(h("span", { className: "text-[11px] text-text-3" }, "No restrictions"));
    }
    row.appendChild(h("span", { className: `text-text-3 transition-transform text-base ${isExpanded ? "rotate-90" : ""}` }, "\u203A"));
    row.addEventListener("click", () => { expandedId = isExpanded ? null : rowId; renderAclPage(root); });
    list.appendChild(row);

    if (isExpanded) {
      list.appendChild(buildGroupForm(root, name, group));
    }
  }

  if (entries.length === 0 && expandedId !== "new-group") {
    container.appendChild(emptyState("No groups configured."));
  } else {
    container.appendChild(list);
  }
}

function buildGroupForm(root: HTMLElement, existingName?: string, existing?: api.AclGroupEntry): HTMLElement {
  const panel = h("div", { className: "bg-surface-1 px-4 pb-4" });
  const inner = h("div", { className: "bg-surface-2 border border-edge rounded-lg p-4" });

  // Name
  if (!existingName) {
    const nameInput = document.createElement("input");
    nameInput.className = inputClass;
    nameInput.placeholder = "e.g. creators, internal";
    nameInput.id = "acl-group-name";
    inner.appendChild(fieldBlock("Group Name", nameInput));
  }

  // Service permissions
  inner.appendChild(h("div", { className: "text-[10.5px] font-medium text-text-3 uppercase tracking-wider mb-2" }, "Service Permissions"));

  for (const svc of cachedServices) {
    const existingSvc = existing?.services[svc.id];
    const isEnabled = existingSvc?.access === "allow";
    const deniedTools = existingSvc?.tools?.deny || [];
    const registryTools = (svc.tools || []).map(t => t.split(" \u2014 ")[0].trim());
    // Merge denied tools that aren't in the registry (e.g. hidden/internal tools)
    const toolNames = [...registryTools, ...deniedTools.filter(t => !registryTools.includes(t))];

    const block = h("div", { className: "bg-surface-3 border border-edge rounded-md p-3 mb-2" });

    // Header with toggle
    const header = h("div", { className: "flex items-center gap-2.5 mb-2" });
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.className = "accent-accent w-3.5 h-3.5 cursor-pointer";
    toggle.checked = isEnabled;
    toggle.dataset.svcId = svc.id;
    toggle.classList.add("svc-toggle");
    header.appendChild(toggle);
    header.appendChild(h("span", { className: "text-[12px] font-medium" }, svc.name));
    header.appendChild(h("span", { className: "text-[11px] text-text-3" }, `\u2014 ${svc.description}`));
    block.appendChild(header);

    // Tool chips
    block.appendChild(h("div", { className: "text-[10px] text-text-3 mb-1.5" }, "Click tools to deny"));
    const toolGrid = h("div", { className: "flex flex-wrap gap-1" });
    toolGrid.dataset.svcId = svc.id;
    toolGrid.classList.add("tool-grid");
    for (const tool of toolNames) {
      const isDenied = deniedTools.includes(tool);
      const chip = h("div", {
        className: `text-[10.5px] font-mono px-2 py-1 rounded border cursor-pointer transition-all select-none ${
          isDenied
            ? "bg-danger-soft border-danger/50 text-danger line-through"
            : "border-edge text-text-2 hover:border-text-3"
        }`,
      }, tool);
      chip.dataset.tool = tool;
      chip.addEventListener("click", () => {
        chip.classList.toggle("bg-danger-soft");
        chip.classList.toggle("border-danger/50");
        chip.classList.toggle("text-danger");
        chip.classList.toggle("line-through");
        chip.classList.toggle("border-edge");
        chip.classList.toggle("text-text-2");
      });
      toolGrid.appendChild(chip);
    }
    block.appendChild(toolGrid);
    inner.appendChild(block);
  }

  // Actions
  const actions = h("div", { className: "flex items-center gap-2 pt-3 mt-3 border-t border-edge" });
  if (existingName) {
    actions.appendChild(btn("Delete Group", {
      variant: "danger", size: "sm",
      onClick: async () => {
        if (!confirm(`Remove group "${existingName}"?`)) return;
        await api.aclAdmin.groups.remove(existingName);
        expandedId = null;
        renderAclPage(root);
      },
    }));
  }
  actions.appendChild(h("div", { className: "flex-1" }));
  actions.appendChild(btn("Cancel", { variant: "outline", size: "sm", onClick: () => { expandedId = null; renderAclPage(root); } }));
  actions.appendChild(btn(existingName ? "Save" : "Add Group", {
    size: "sm",
    onClick: async () => {
      const name = existingName || (document.getElementById("acl-group-name") as HTMLInputElement)?.value.trim();
      if (!name) return;

      const services: api.AclGroupEntry["services"] = {};
      for (const svc of cachedServices) {
        const toggle = inner.querySelector(`.svc-toggle[data-svc-id="${svc.id}"]`) as HTMLInputElement;
        const grid = inner.querySelector(`.tool-grid[data-svc-id="${svc.id}"]`);
        if (!toggle?.checked) continue;

        const denied: string[] = [];
        grid?.querySelectorAll("[data-tool]").forEach(chip => {
          if (chip.classList.contains("line-through")) denied.push(chip.getAttribute("data-tool")!);
        });

        const svcConfig: api.AclServiceConfig = { access: "allow" };
        if (denied.length > 0) svcConfig.tools = { deny: denied };
        services[svc.id] = svcConfig;
      }

      await api.aclAdmin.groups.upsert(name, { services });
      expandedId = null;
      renderAclPage(root);
    },
  }));
  inner.appendChild(actions);
  panel.appendChild(inner);
  return panel;
}

// ═══════════════════════════════════════
// Domains Tab
// ═══════════════════════════════════════

async function renderDomainsTab(container: HTMLElement, root: HTMLElement) {
  const domains = await api.aclAdmin.domains.list();
  const entries = Object.entries(domains);
  const groupNames = Object.keys(cachedGroups);

  const bar = h("div", { className: "flex justify-between items-center mb-3" });
  bar.appendChild(h("span", { className: "text-xs text-text-3" }, `${entries.length} domain${entries.length !== 1 ? "s" : ""}`));
  bar.appendChild(btn("+ Add Domain", {
    size: "sm",
    onClick: () => { expandedId = expandedId === "new-domain" ? null : "new-domain"; renderAclPage(root); },
  }));
  container.appendChild(bar);

  const list = h("div", { className: "flex flex-col gap-px bg-edge border border-edge rounded-lg overflow-hidden" });

  if (expandedId === "new-domain") {
    list.appendChild(buildDomainForm(root, groupNames));
  }

  for (const [domain, def] of entries) {
    const rowId = `domain-${domain}`;
    const isExpanded = expandedId === rowId;

    const row = h("div", {
      className: `flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isExpanded ? "bg-surface-1" : "bg-surface-2 hover:bg-surface-3"}`,
    });
    row.appendChild(h("span", { className: "font-mono text-[11.5px] font-medium min-w-[200px]" }, domain));
    const groupsDiv = h("div", { className: "flex gap-1 flex-wrap flex-1" });
    for (const g of def.groups || []) {
      groupsDiv.appendChild(pill(g, "neutral"));
    }
    row.appendChild(groupsDiv);
    row.appendChild(h("span", { className: `text-text-3 transition-transform text-base ${isExpanded ? "rotate-90" : ""}` }, "\u203A"));
    row.addEventListener("click", () => { expandedId = isExpanded ? null : rowId; renderAclPage(root); });
    list.appendChild(row);

    if (isExpanded) {
      list.appendChild(buildDomainForm(root, groupNames, domain, def));
    }
  }

  if (entries.length === 0 && expandedId !== "new-domain") {
    container.appendChild(emptyState("No domain rules configured."));
  } else {
    container.appendChild(list);
  }
}

function buildDomainForm(root: HTMLElement, groupNames: string[], existingDomain?: string, existing?: api.AclDomainEntry): HTMLElement {
  const panel = h("div", { className: "bg-surface-1 px-4 pb-4" });
  const inner = h("div", { className: "bg-surface-2 border border-edge rounded-lg p-4" });

  if (!existingDomain) {
    const domainInput = document.createElement("input");
    domainInput.className = inputClass;
    domainInput.placeholder = "example.com";
    domainInput.id = "acl-domain-input";
    inner.appendChild(fieldBlock("Domain", domainInput));
  }

  inner.appendChild(fieldBlock("Groups", buildChipSelect(groupNames, existing?.groups || [], "acl-domain-groups"),
    "All users with this email domain get assigned to selected groups"));

  // Actions
  const actions = h("div", { className: "flex items-center gap-2 pt-3 mt-3 border-t border-edge" });
  if (existingDomain) {
    actions.appendChild(btn("Delete Domain", {
      variant: "danger", size: "sm",
      onClick: async () => {
        if (!confirm(`Remove domain rule "${existingDomain}"?`)) return;
        await api.aclAdmin.domains.remove(existingDomain);
        expandedId = null;
        renderAclPage(root);
      },
    }));
  }
  actions.appendChild(h("div", { className: "flex-1" }));
  actions.appendChild(btn("Cancel", { variant: "outline", size: "sm", onClick: () => { expandedId = null; renderAclPage(root); } }));
  actions.appendChild(btn(existingDomain ? "Save" : "Add Domain", {
    size: "sm",
    onClick: async () => {
      const domain = existingDomain || (document.getElementById("acl-domain-input") as HTMLInputElement)?.value.trim().toLowerCase();
      if (!domain) return;
      const groups = getSelectedChips("acl-domain-groups");
      await api.aclAdmin.domains.upsert(domain, { groups });
      expandedId = null;
      renderAclPage(root);
    },
  }));
  inner.appendChild(actions);
  panel.appendChild(inner);
  return panel;
}

// ═══════════════════════════════════════
// Test Tab
// ═══════════════════════════════════════

async function renderTestTab(container: HTMLElement) {
  const form = h("div", { className: "bg-surface-2 border border-edge rounded-lg p-5" });

  const emailInput = document.createElement("input");
  emailInput.className = inputClass;
  emailInput.placeholder = "user@example.com";
  form.appendChild(fieldBlock("Email", emailInput));

  const row = h("div", { className: "flex gap-3" });

  const serviceSelect = document.createElement("select");
  serviceSelect.className = inputClass;
  for (const svc of cachedServices) {
    const opt = document.createElement("option");
    opt.value = svc.id;
    opt.textContent = `${svc.name} \u2014 ${svc.description}`;
    serviceSelect.appendChild(opt);
  }

  // Tool select — populated from service tools
  const toolSelect = document.createElement("select");
  toolSelect.className = inputClass;
  function populateTools() {
    toolSelect.innerHTML = "";
    const svc = cachedServices.find(s => s.id === serviceSelect.value);
    for (const tool of svc?.tools || []) {
      const opt = document.createElement("option");
      const name = tool.split(" \u2014 ")[0].trim();
      opt.value = name;
      opt.textContent = name;
      toolSelect.appendChild(opt);
    }
  }
  serviceSelect.addEventListener("change", populateTools);
  populateTools();

  const svcField = h("div", { className: "flex-1" });
  svcField.appendChild(h("div", { className: "text-[10.5px] font-medium text-text-3 uppercase tracking-wider mb-1.5" }, "Service"));
  svcField.appendChild(serviceSelect);
  row.appendChild(svcField);

  const toolField = h("div", { className: "flex-1" });
  toolField.appendChild(h("div", { className: "text-[10.5px] font-medium text-text-3 uppercase tracking-wider mb-1.5" }, "Tool"));
  toolField.appendChild(toolSelect);
  row.appendChild(toolField);

  form.appendChild(h("div", { className: "mb-4" }, row));

  const resultBox = h("div", { className: "hidden mt-4" });
  resultBox.id = "acl-test-result";

  const testBtn = btn("Test Access", {
    onClick: async () => {
      const email = emailInput.value.trim();
      const service = serviceSelect.value;
      const tool = toolSelect.value;
      if (!email || !service || !tool) return;

      resultBox.innerHTML = "";
      resultBox.classList.remove("hidden");

      try {
        const result = await api.aclAdmin.test(email, service, tool);
        const resultEl = h("div", { className: "flex items-center gap-2 bg-surface-3 border border-edge rounded-md p-3" });
        resultEl.appendChild(pill(result.allowed ? "Allowed" : "Denied", result.allowed ? "ok" : "neutral"));
        resultEl.appendChild(h("span", { className: "text-[12px] text-text-2" }, result.reason));
        resultBox.appendChild(resultEl);
      } catch (e) {
        resultBox.appendChild(h("div", { className: "bg-danger-soft border border-danger/20 rounded-md p-3 text-[12px] text-danger" },
          `Error: ${(e as Error).message}`));
      }
    },
  });
  form.appendChild(h("div", { className: "pt-1" }, testBtn));
  form.appendChild(resultBox);

  container.appendChild(form);
}

// ═══════════════════════════════════════
// Shared Helpers
// ═══════════════════════════════════════

const inputClass = "w-full px-3 py-2 bg-surface-3 border border-edge rounded-md text-[12.5px] text-text-0 outline-hidden focus:border-accent font-[family-name:var(--font-sans)]";

function fieldBlock(label: string, content: HTMLElement, hint?: string): HTMLElement {
  const div = h("div", { className: "mb-4" });
  div.appendChild(h("div", { className: "text-[10.5px] font-medium text-text-3 uppercase tracking-wider mb-1.5" }, label));
  div.appendChild(content);
  if (hint) {
    div.appendChild(h("p", { className: "mt-1.5 text-[10px] text-text-3" }, hint));
  }
  return div;
}

function buildChipSelect(options: string[], selected: string[], groupId: string): HTMLElement {
  const container = h("div", { className: "flex flex-wrap gap-1.5" });
  container.id = groupId;
  for (const opt of options) {
    const isSelected = selected.includes(opt);
    const chip = h("div", {
      className: `text-[11px] px-2.5 py-1 rounded-md border cursor-pointer transition-all select-none ${
        isSelected
          ? "bg-accent-soft border-accent/50 text-accent font-medium"
          : "border-edge text-text-2 hover:border-text-3 hover:text-text-1"
      }`,
    }, opt);
    chip.dataset.value = opt;
    chip.addEventListener("click", () => {
      const isSel = chip.classList.contains("text-accent");
      chip.className = `text-[11px] px-2.5 py-1 rounded-md border cursor-pointer transition-all select-none ${
        !isSel
          ? "bg-accent-soft border-accent/50 text-accent font-medium"
          : "border-edge text-text-2 hover:border-text-3 hover:text-text-1"
      }`;
    });
    container.appendChild(chip);
  }
  return container;
}

function getSelectedChips(groupId: string): string[] {
  const container = document.getElementById(groupId);
  if (!container) return [];
  const chips: string[] = [];
  container.querySelectorAll("[data-value]").forEach(chip => {
    if (chip.classList.contains("text-accent")) chips.push(chip.getAttribute("data-value")!);
  });
  return chips;
}
