import * as api from "../api";
import { h, btn, input, field, pill, emptyState } from "../components/ui";
import { showModal, hideModal, modalCard } from "../components/modal";

let currentTab: "users" | "groups" | "domains" | "test" = "users";

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
      renderAclPage(root);
    });
    tabs.appendChild(tabBtn);
  }
  container.appendChild(tabs);

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
    const errCard = h("div", { className: "bg-danger-soft border border-danger/20 rounded-lg p-4 text-[12.5px] text-danger" },
      `Failed to load ACL data: ${(e as Error).message}`);
    container.appendChild(errCard);
  }

  root.appendChild(container);
}

// ═══════════════════════════════════════
// Users Tab
// ═══════════════════════════════════════

async function renderUsersTab(container: HTMLElement, root: HTMLElement) {
  const users = await api.aclAdmin.users.list();
  const entries = Object.entries(users);

  const bar = h("div", { className: "flex justify-between items-center mb-3" });
  bar.appendChild(h("span", { className: "text-xs text-text-3" }, `${entries.length} user${entries.length !== 1 ? "s" : ""}`));
  bar.appendChild(btn("+ Add User", { onClick: () => showUserModal(root) }));
  container.appendChild(bar);

  if (entries.length === 0) {
    container.appendChild(emptyState("No users configured."));
    return;
  }

  const table = makeTable(["Email", "Role", "Groups", ""]);
  const tbody = table.querySelector("tbody")!;

  for (const [email, user] of entries) {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-accent-soft/30";

    appendTd(tr, email, "font-medium font-mono text-[11.5px]");
    appendTd(tr, user.role || "user");

    const groupsTd = document.createElement("td");
    groupsTd.className = "px-4 py-3 text-[12px] border-b border-edge";
    if (user.groups && user.groups.length > 0) {
      for (const g of user.groups) {
        groupsTd.appendChild(pill(g, "neutral"));
        groupsTd.appendChild(document.createTextNode(" "));
      }
    } else {
      groupsTd.appendChild(h("span", { className: "text-text-3" }, "—"));
    }
    tr.appendChild(groupsTd);

    const actionTd = document.createElement("td");
    actionTd.className = "px-4 py-3 text-right border-b border-edge";
    const actions = h("div", { className: "flex justify-end gap-2" });
    actions.appendChild(btn("Edit", { variant: "outline", size: "sm", onClick: () => showUserModal(root, email, user) }));
    actions.appendChild(btn("Delete", {
      variant: "danger", size: "sm",
      onClick: async () => {
        if (!confirm(`Remove user "${email}" from ACL?`)) return;
        await api.aclAdmin.users.remove(email);
        renderAclPage(root);
      },
    }));
    actionTd.appendChild(actions);
    tr.appendChild(actionTd);

    tbody.appendChild(tr);
  }

  container.appendChild(table);
}

function showUserModal(root: HTMLElement, existingEmail?: string, existing?: api.AclUserEntry) {
  const emailInput = input({ placeholder: "user@example.com" });
  if (existingEmail) {
    emailInput.value = existingEmail;
    emailInput.disabled = true;
    emailInput.className += " opacity-60";
  }

  const roleSelect = document.createElement("select");
  roleSelect.className = "w-full px-3 py-2 bg-surface-3 border border-edge rounded-md text-[12.5px] text-text-0 outline-hidden focus:border-accent font-[family-name:var(--font-sans)]";
  for (const role of ["user", "admin"]) {
    const opt = document.createElement("option");
    opt.value = role;
    opt.textContent = role;
    if (existing?.role === role) opt.selected = true;
    roleSelect.appendChild(opt);
  }

  const groupsInput = input({ placeholder: "creators, internal (comma-separated)" });
  if (existing?.groups) groupsInput.value = existing.groups.join(", ");

  const body = h("div", {});
  body.appendChild(field("Email", emailInput));
  body.appendChild(field("Role", roleSelect));
  body.appendChild(field("Groups", groupsInput, "Comma-separated group names"));

  const footer = h("div", { className: "flex justify-end gap-2 mt-1" });
  footer.appendChild(btn("Cancel", { variant: "outline", onClick: hideModal }));
  footer.appendChild(btn(existingEmail ? "Update" : "Add", {
    onClick: async () => {
      const email = emailInput.value.trim().toLowerCase();
      if (!email) return;
      const groups = groupsInput.value.split(",").map((g) => g.trim()).filter(Boolean);
      const userData: api.AclUserEntry = {
        role: roleSelect.value as "admin" | "user",
      };
      if (groups.length > 0) userData.groups = groups;
      await api.aclAdmin.users.upsert(email, userData);
      hideModal();
      renderAclPage(root);
    },
  }));

  showModal(modalCard({
    title: existingEmail ? `Edit User — ${existingEmail}` : "Add User",
    body,
    footer,
  }));
}

// ═══════════════════════════════════════
// Groups Tab
// ═══════════════════════════════════════

async function renderGroupsTab(container: HTMLElement, root: HTMLElement) {
  const groups = await api.aclAdmin.groups.list();
  const entries = Object.entries(groups);

  const bar = h("div", { className: "flex justify-between items-center mb-3" });
  bar.appendChild(h("span", { className: "text-xs text-text-3" }, `${entries.length} group${entries.length !== 1 ? "s" : ""}`));
  bar.appendChild(btn("+ Add Group", { onClick: () => showGroupModal(root) }));
  container.appendChild(bar);

  if (entries.length === 0) {
    container.appendChild(emptyState("No groups configured."));
    return;
  }

  const table = makeTable(["Group", "Services", "Tool Restrictions", ""]);
  const tbody = table.querySelector("tbody")!;

  for (const [name, group] of entries) {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-accent-soft/30";

    appendTd(tr, name, "font-medium");

    // Services
    const svcNames = Object.keys(group.services);
    const svcTd = document.createElement("td");
    svcTd.className = "px-4 py-3 text-[12px] border-b border-edge";
    for (const svc of svcNames) {
      const access = group.services[svc].access || "deny";
      svcTd.appendChild(pill(svc, access === "allow" ? "ok" : "neutral"));
      svcTd.appendChild(document.createTextNode(" "));
    }
    tr.appendChild(svcTd);

    // Tool restrictions summary
    const denyCount = svcNames.reduce((sum, svc) => sum + (group.services[svc].tools?.deny?.length || 0), 0);
    appendTd(tr, denyCount > 0 ? `${denyCount} denied` : "None", denyCount > 0 ? "text-warn" : "text-text-3");

    const actionTd = document.createElement("td");
    actionTd.className = "px-4 py-3 text-right border-b border-edge";
    const actions = h("div", { className: "flex justify-end gap-2" });
    actions.appendChild(btn("Edit", { variant: "outline", size: "sm", onClick: () => showGroupModal(root, name, group) }));
    actions.appendChild(btn("Delete", {
      variant: "danger", size: "sm",
      onClick: async () => {
        if (!confirm(`Remove group "${name}"?`)) return;
        await api.aclAdmin.groups.remove(name);
        renderAclPage(root);
      },
    }));
    actionTd.appendChild(actions);
    tr.appendChild(actionTd);

    tbody.appendChild(tr);
  }

  container.appendChild(table);
}

async function showGroupModal(root: HTMLElement, existingName?: string, existing?: api.AclGroupEntry) {
  const nameInput = input({ placeholder: "e.g. creators, internal" });
  if (existingName) {
    nameInput.value = existingName;
    nameInput.disabled = true;
    nameInput.className += " opacity-60";
  }

  // Load available services for service config
  let allServices: api.McpService[] = [];
  try {
    allServices = await api.services.list();
  } catch { /* fallback empty */ }

  const body = h("div", {});
  body.appendChild(field("Group Name", nameInput));

  // Per-service config
  const svcLabel = h("div", { className: "text-[10.5px] font-medium text-text-3 uppercase tracking-wider mb-2 mt-4" }, "Service Permissions");
  body.appendChild(svcLabel);

  const svcConfigs: { serviceId: string; accessCheckbox: HTMLInputElement; denyInput: HTMLInputElement }[] = [];

  for (const svc of allServices) {
    const row = h("div", { className: "bg-surface-2 border border-edge rounded-md p-3 mb-2" });

    const rowHeader = h("div", { className: "flex items-center gap-3 mb-2" });

    const accessCb = document.createElement("input");
    accessCb.type = "checkbox";
    accessCb.className = "accent-accent";
    const existingSvc = existing?.services[svc.id];
    accessCb.checked = existingSvc?.access === "allow";

    rowHeader.appendChild(accessCb);
    rowHeader.appendChild(h("span", { className: "text-[12px] font-medium" }, svc.name));
    rowHeader.appendChild(h("span", { className: "text-[11px] text-text-3 ml-1" }, `— ${svc.description}`));
    row.appendChild(rowHeader);

    const denyInput = input({ placeholder: "Tools to deny (comma-separated)" });
    if (existingSvc?.tools?.deny) denyInput.value = existingSvc.tools.deny.join(", ");
    row.appendChild(field("Deny Tools", denyInput, svc.tools?.map((t) => t.split(" — ")[0]).join(", ")));

    svcConfigs.push({ serviceId: svc.id, accessCheckbox: accessCb, denyInput });
    body.appendChild(row);
  }

  const footer = h("div", { className: "flex justify-end gap-2 mt-1" });
  footer.appendChild(btn("Cancel", { variant: "outline", onClick: hideModal }));
  footer.appendChild(btn(existingName ? "Update" : "Add", {
    onClick: async () => {
      const name = nameInput.value.trim();
      if (!name) return;

      const services: api.AclGroupEntry["services"] = {};
      for (const cfg of svcConfigs) {
        if (!cfg.accessCheckbox.checked && !cfg.denyInput.value.trim()) continue;
        const svcConfig: api.AclServiceConfig = {};
        if (cfg.accessCheckbox.checked) svcConfig.access = "allow";
        const denyTools = cfg.denyInput.value.split(",").map((t) => t.trim()).filter(Boolean);
        if (denyTools.length > 0) svcConfig.tools = { deny: denyTools };
        services[cfg.serviceId] = svcConfig;
      }

      await api.aclAdmin.groups.upsert(name, { services });
      hideModal();
      renderAclPage(root);
    },
  }));

  showModal(modalCard({
    title: existingName ? `Edit Group — ${existingName}` : "Add Group",
    body,
    footer,
  }));
}

// ═══════════════════════════════════════
// Domains Tab
// ═══════════════════════════════════════

async function renderDomainsTab(container: HTMLElement, root: HTMLElement) {
  const domains = await api.aclAdmin.domains.list();
  const entries = Object.entries(domains);

  const bar = h("div", { className: "flex justify-between items-center mb-3" });
  bar.appendChild(h("span", { className: "text-xs text-text-3" }, `${entries.length} domain${entries.length !== 1 ? "s" : ""}`));
  bar.appendChild(btn("+ Add Domain", { onClick: () => showDomainModal(root) }));
  container.appendChild(bar);

  if (entries.length === 0) {
    container.appendChild(emptyState("No domain rules configured."));
    return;
  }

  const table = makeTable(["Domain", "Groups", ""]);
  const tbody = table.querySelector("tbody")!;

  for (const [domain, def] of entries) {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-accent-soft/30";

    appendTd(tr, domain, "font-medium font-mono text-[11.5px]");

    const groupsTd = document.createElement("td");
    groupsTd.className = "px-4 py-3 text-[12px] border-b border-edge";
    if (def.groups && def.groups.length > 0) {
      for (const g of def.groups) {
        groupsTd.appendChild(pill(g, "neutral"));
        groupsTd.appendChild(document.createTextNode(" "));
      }
    } else {
      groupsTd.appendChild(h("span", { className: "text-text-3" }, "—"));
    }
    tr.appendChild(groupsTd);

    const actionTd = document.createElement("td");
    actionTd.className = "px-4 py-3 text-right border-b border-edge";
    const actions = h("div", { className: "flex justify-end gap-2" });
    actions.appendChild(btn("Edit", { variant: "outline", size: "sm", onClick: () => showDomainModal(root, domain, def) }));
    actions.appendChild(btn("Delete", {
      variant: "danger", size: "sm",
      onClick: async () => {
        if (!confirm(`Remove domain rule "${domain}"?`)) return;
        await api.aclAdmin.domains.remove(domain);
        renderAclPage(root);
      },
    }));
    actionTd.appendChild(actions);
    tr.appendChild(actionTd);

    tbody.appendChild(tr);
  }

  container.appendChild(table);
}

function showDomainModal(root: HTMLElement, existingDomain?: string, existing?: api.AclDomainEntry) {
  const domainInput = input({ placeholder: "example.com" });
  if (existingDomain) {
    domainInput.value = existingDomain;
    domainInput.disabled = true;
    domainInput.className += " opacity-60";
  }

  const groupsInput = input({ placeholder: "creators, internal (comma-separated)" });
  if (existing?.groups) groupsInput.value = existing.groups.join(", ");

  const body = h("div", {});
  body.appendChild(field("Domain", domainInput, "All users with this email domain will be assigned to the specified groups"));
  body.appendChild(field("Groups", groupsInput, "Comma-separated group names"));

  const footer = h("div", { className: "flex justify-end gap-2 mt-1" });
  footer.appendChild(btn("Cancel", { variant: "outline", onClick: hideModal }));
  footer.appendChild(btn(existingDomain ? "Update" : "Add", {
    onClick: async () => {
      const domain = domainInput.value.trim().toLowerCase();
      if (!domain) return;
      const groups = groupsInput.value.split(",").map((g) => g.trim()).filter(Boolean);
      await api.aclAdmin.domains.upsert(domain, { groups });
      hideModal();
      renderAclPage(root);
    },
  }));

  showModal(modalCard({
    title: existingDomain ? `Edit Domain — ${existingDomain}` : "Add Domain Rule",
    body,
    footer,
  }));
}

// ═══════════════════════════════════════
// Test Tab
// ═══════════════════════════════════════

async function renderTestTab(container: HTMLElement) {
  let allServices: api.McpService[] = [];
  try {
    allServices = await api.services.list();
  } catch { /* fallback empty */ }

  const form = h("div", { className: "bg-surface-2 border border-edge rounded-lg p-5" });

  const emailInput = input({ placeholder: "user@example.com" });
  form.appendChild(field("Email", emailInput));

  const serviceSelect = document.createElement("select");
  serviceSelect.className = "w-full px-3 py-2 bg-surface-3 border border-edge rounded-md text-[12.5px] text-text-0 outline-hidden focus:border-accent font-[family-name:var(--font-sans)]";
  for (const svc of allServices) {
    const opt = document.createElement("option");
    opt.value = svc.id;
    opt.textContent = `${svc.name} — ${svc.description}`;
    serviceSelect.appendChild(opt);
  }
  form.appendChild(field("Service", serviceSelect));

  const toolInput = input({ placeholder: "tool name (e.g. transcribe, search)" });
  form.appendChild(field("Tool", toolInput));

  const resultBox = h("div", { className: "mt-4 hidden" });
  resultBox.id = "acl-test-result";
  form.appendChild(resultBox);

  const testBtn = btn("Test Access", {
    onClick: async () => {
      const email = emailInput.value.trim();
      const service = serviceSelect.value;
      const tool = toolInput.value.trim();
      if (!email || !service || !tool) return;

      resultBox.innerHTML = "";
      resultBox.classList.remove("hidden");

      try {
        const result = await api.aclAdmin.test(email, service, tool);
        const resultPill = pill(result.allowed ? "Allowed" : "Denied", result.allowed ? "ok" : "neutral");
        const reason = h("span", { className: "text-[12px] text-text-2 ml-2" }, result.reason);
        resultBox.appendChild(h("div", { className: "flex items-center gap-2 bg-surface-3 border border-edge rounded-md p-3" }, resultPill, reason));
      } catch (e) {
        resultBox.appendChild(h("div", { className: "bg-danger-soft border border-danger/20 rounded-md p-3 text-[12px] text-danger" },
          `Error: ${(e as Error).message}`));
      }
    },
  });
  form.appendChild(h("div", { className: "pt-1" }, testBtn));

  container.appendChild(form);
}

// ═══════════════════════════════════════
// Helpers
// ═══════════════════════════════════════

function makeTable(columns: string[]): HTMLTableElement {
  const table = document.createElement("table");
  table.className = "w-full border-collapse bg-surface-2 border border-edge rounded-lg overflow-hidden";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const col of columns) {
    const th = document.createElement("th");
    th.className = "text-left px-4 py-2.5 text-[10px] font-medium text-text-3 uppercase tracking-wider bg-surface-3 border-b border-edge";
    th.textContent = col;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  table.appendChild(tbody);

  return table;
}

function appendTd(tr: HTMLTableRowElement, text: string, extraClass = "") {
  const td = document.createElement("td");
  td.className = `px-4 py-3 text-[12px] border-b border-edge text-text-1 ${extraClass}`;
  td.textContent = text;
  tr.appendChild(td);
}
