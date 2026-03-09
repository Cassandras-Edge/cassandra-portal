import * as api from "../api";
import { h, btn, input, field, pill, mono, emptyState, fmtDate, maskKey, copyToClipboard } from "../components/ui";
import { showModal, hideModal, modalCard } from "../components/modal";

let currentProject: api.Project | null = null;
let currentService: api.McpService | null = null;
let allProjects: api.Project[] = [];
let allServices: api.McpService[] = [];
let currentTab: "keys" | "credentials" = "keys";

export async function renderWorkbench(root: HTMLElement) {
  root.innerHTML = "";

  // Load data
  [allProjects, allServices] = await Promise.all([api.projects.list(), api.services.list()]);

  if (!currentProject && allProjects.length > 0) {
    currentProject = allProjects[0];
  }

  // Project header
  const header = h("div", {
    className: "flex items-center gap-3 mb-4",
  });

  // Project switcher
  const select = document.createElement("select");
  select.className =
    "bg-surface-2 border border-edge rounded-md px-3 py-1.5 text-xs text-text-0 outline-hidden focus:border-accent font-[family-name:var(--font-sans)]";
  for (const p of allProjects) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.kind === "personal" ? `${p.name}` : p.name;
    if (currentProject && p.id === currentProject.id) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => {
    currentProject = allProjects.find((p) => p.id === select.value) || null;
    currentService = null;
    renderWorkbench(root);
  });

  header.appendChild(h("span", { className: "text-xs text-text-3 font-medium uppercase tracking-wider" }, "Project"));
  header.appendChild(select);
  header.appendChild(btn("+ New Project", { variant: "outline", size: "sm", onClick: () => showNewProjectModal(root) }));

  if (currentProject && currentProject.kind === "shared") {
    header.appendChild(btn("Members", { variant: "outline", size: "sm", onClick: () => showMembersModal(root) }));
  }

  root.appendChild(header);

  // Main layout: sidebar + detail
  const layout = h("div", { className: "grid grid-cols-[200px_1fr] gap-3 min-h-[400px]" });

  // Service sidebar
  const sidebar = h("div", { className: "bg-surface-2 border border-edge rounded-lg overflow-hidden" });
  const sidebarHeader = h("div", {
    className: "px-4 py-3 border-b border-edge",
  }, h("span", { className: "text-xs font-medium text-text-1" }, "Services"));
  sidebar.appendChild(sidebarHeader);

  const sidebarBody = h("div", { className: "p-2" });
  for (const svc of allServices) {
    const item = h("div", {
      className: `flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-all ${
        currentService?.id === svc.id
          ? "bg-accent-soft text-accent font-medium"
          : "text-text-2 hover:bg-surface-3 hover:text-text-1"
      }`,
    });
    item.style.cursor = "pointer";

    const dot = h("span", {
      className: `w-1.5 h-1.5 rounded-full shrink-0 ${svc.status === "active" ? "bg-ok" : "bg-text-3"}`,
    });
    item.appendChild(dot);
    item.appendChild(h("span", {}, svc.name));

    item.addEventListener("click", () => {
      currentService = svc;
      currentTab = "keys";
      renderWorkbench(root);
    });
    sidebarBody.appendChild(item);
  }
  sidebar.appendChild(sidebarBody);
  layout.appendChild(sidebar);

  // Detail pane
  const detail = h("div", {});

  if (!currentService) {
    detail.appendChild(emptyState("Select a service to manage its keys and credentials"));
  } else {
    // Service header
    const svcHeader = h("div", { className: "flex justify-between items-start mb-3" });
    const svcInfo = h("div", {});
    svcInfo.appendChild(h("h2", { className: "text-base font-semibold mb-0.5" }, currentService.name));
    svcInfo.appendChild(h("p", { className: "text-xs text-text-2 mb-1.5" }, currentService.description));
    const statusRow = h("div", { className: "flex items-center gap-2" });
    statusRow.appendChild(pill(currentService.status === "active" ? "Active" : "Planned", currentService.status === "active" ? "ok" : "neutral"));
    if (currentService.status === "active") {
      api.getDomain().then((domain) => {
        if (domain) statusRow.appendChild(h("span", { className: "text-[11px] text-text-3" }, `${currentService!.id}.${domain}/mcp`));
      });
    }
    svcInfo.appendChild(statusRow);
    svcHeader.appendChild(svcInfo);
    detail.appendChild(svcHeader);

    // Tabs
    const tabs = h("div", { className: "flex gap-0.5 mb-3" });
    for (const tab of ["keys", "credentials"] as const) {
      const tabBtn = h("button", {
        className: `px-4 py-2 rounded-md text-xs transition-all ${
          currentTab === tab
            ? "bg-accent-soft text-accent font-medium"
            : "text-text-2 hover:bg-surface-3 hover:text-text-1"
        }`,
      }, tab.charAt(0).toUpperCase() + tab.slice(1));
      tabBtn.addEventListener("click", () => {
        currentTab = tab;
        renderWorkbench(root);
      });
      tabs.appendChild(tabBtn);
    }
    detail.appendChild(tabs);

    // Tab content
    if (currentTab === "keys") {
      await renderKeysTab(detail, currentProject!, currentService);
    } else {
      await renderCredentialsTab(detail, currentProject!, currentService);
    }
  }

  layout.appendChild(detail);
  root.appendChild(layout);
}

async function renderKeysTab(container: HTMLElement, project: api.Project, service: api.McpService) {
  if (service.status !== "active") {
    container.appendChild(emptyState("This service is not yet active"));
    return;
  }

  let serviceKeys: api.McpKey[] = [];
  try {
    serviceKeys = await api.keys.list(project.id, service.id);
  } catch {
    // Project might not have keys yet
  }

  // New key button
  const bar = h("div", { className: "flex justify-between items-center mb-3" });
  bar.appendChild(h("span", { className: "text-xs text-text-3" }, `${serviceKeys.length} key${serviceKeys.length !== 1 ? "s" : ""}`));
  bar.appendChild(btn("+ New Key", { onClick: () => showCreateKeyModal(container, project, service) }));
  container.appendChild(bar);

  if (serviceKeys.length === 0) {
    container.appendChild(emptyState(`No keys for ${service.name} in this project yet.`));
    return;
  }

  // Keys table
  const table = document.createElement("table");
  table.className = "w-full border-collapse bg-surface-2 border border-edge rounded-lg overflow-hidden";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const col of ["Name", "Key", "Created By", "Created", ""]) {
    const th = document.createElement("th");
    th.className = "text-left px-4 py-2.5 text-[10.5px] font-medium text-text-3 uppercase tracking-wider bg-surface-3 border-b border-edge";
    th.textContent = col;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const key of serviceKeys) {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-accent-soft/30";

    const cells = [
      { text: key.name, className: "font-medium" },
      { el: mono(maskKey(key.key_id)) },
      { text: key.created_by, className: "text-text-3" },
      { text: fmtDate(key.created_at), className: "text-text-3" },
    ];

    for (const cell of cells) {
      const td = document.createElement("td");
      td.className = "px-4 py-3 text-[12.5px] border-b border-edge text-text-1 " + (cell.className || "");
      if (cell.el) td.appendChild(cell.el);
      else td.textContent = cell.text || "";
      tr.appendChild(td);
    }

    const actionTd = document.createElement("td");
    actionTd.className = "px-4 py-3 text-right border-b border-edge";
    actionTd.appendChild(
      btn("Delete", {
        variant: "danger",
        size: "sm",
        onClick: async () => {
          if (!confirm(`Delete key "${key.name}"? This cannot be undone.`)) return;
          await api.keys.delete(project.id, service.id, key.key_id);
          renderWorkbench(container.closest("#app")! as HTMLElement);
        },
      }),
    );
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

async function renderCredentialsTab(container: HTMLElement, project: api.Project, service: api.McpService) {
  if (!service.credentialsSchema || service.credentialsSchema.length === 0) {
    container.appendChild(emptyState(`${service.name} does not require service-level credentials.`));
    return;
  }

  let meta: api.CredentialMeta = { has_credentials: false, updated_at: null, updated_by: null };
  try {
    meta = await api.credentials.get(project.id, service.id);
  } catch {
    // No credentials yet
  }

  const card = h("div", { className: "bg-surface-2 border border-edge rounded-lg p-5" });

  if (meta.has_credentials) {
    card.appendChild(h("div", { className: "flex items-center gap-2 mb-3" },
      pill("Configured", "ok"),
      h("span", { className: "text-[11px] text-text-3" }, `Updated ${fmtDate(meta.updated_at)} by ${meta.updated_by || "unknown"}`),
    ));
    card.appendChild(h("p", { className: "text-xs text-text-2 mb-4" },
      "Credentials are set for this service. All keys in this project will use these credentials.",
    ));

    const actions = h("div", { className: "flex gap-2" });
    actions.appendChild(btn("Update Credentials", {
      variant: "outline",
      onClick: () => showCredentialFormModal(container, project, service),
    }));
    actions.appendChild(btn("Remove", {
      variant: "danger",
      onClick: async () => {
        if (!confirm("Remove credentials? Keys in this project will lose access to this service.")) return;
        await api.credentials.remove(project.id, service.id);
        renderWorkbench(container.closest("#app")! as HTMLElement);
      },
    }));
    card.appendChild(actions);
  } else {
    card.appendChild(h("p", { className: "text-xs text-text-2 mb-4" },
      `Configure your ${service.name} credentials for this project. All keys will share these credentials.`,
    ));
    card.appendChild(btn("Set Up Credentials", {
      onClick: () => showCredentialFormModal(container, project, service),
    }));
  }

  container.appendChild(card);
}

// ── Modals ──

function showNewProjectModal(root: HTMLElement) {
  const nameInput = input({ placeholder: "e.g. Production, Client-X" });
  const body = field("Project Name", nameInput);

  const footer = h("div", { className: "flex justify-end gap-2 mt-1" });
  footer.appendChild(btn("Cancel", { variant: "outline", onClick: hideModal }));
  footer.appendChild(btn("Create", {
    onClick: async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      await api.projects.create(name);
      hideModal();
      allProjects = await api.projects.list();
      currentProject = allProjects.find((p) => p.name === name) || allProjects[0];
      renderWorkbench(root);
    },
  }));

  showModal(modalCard({ title: "New Project", description: "Create a shared project to organize keys and credentials.", body, footer }));
}

function showMembersModal(root: HTMLElement) {
  if (!currentProject) return;
  const projectId = currentProject.id;

  const container = h("div", {});

  const renderMembers = async () => {
    const memberList = await api.members.list(projectId);
    container.innerHTML = "";

    for (const m of memberList) {
      const row = h("div", { className: "flex items-center justify-between py-2 border-b border-edge last:border-0" });
      row.appendChild(h("div", {},
        h("span", { className: "text-xs text-text-1" }, m.email),
        h("span", { className: "text-[10px] text-text-3 ml-2" }, m.role),
      ));
      if (m.role !== "owner") {
        row.appendChild(btn("Remove", {
          variant: "danger",
          size: "sm",
          onClick: async () => {
            await api.members.remove(projectId, m.email);
            renderMembers();
          },
        }));
      }
      container.appendChild(row);
    }

    // Add member form
    const addRow = h("div", { className: "flex gap-2 mt-3" });
    const emailInput = input({ placeholder: "user@example.com" });
    addRow.appendChild(emailInput);
    addRow.appendChild(btn("Add", {
      size: "sm",
      onClick: async () => {
        const email = emailInput.value.trim();
        if (!email) return;
        try {
          await api.members.add(projectId, email);
          renderMembers();
        } catch (e) {
          alert((e as Error).message);
        }
      },
    }));
    container.appendChild(addRow);
  };

  renderMembers();

  const footer = h("div", { className: "flex justify-end mt-2" });
  footer.appendChild(btn("Done", { onClick: () => { hideModal(); renderWorkbench(root); } }));

  showModal(modalCard({ title: "Project Members", description: `Manage members for ${currentProject.name}`, body: container, footer }));
}

function showCreateKeyModal(container: HTMLElement, project: api.Project, service: api.McpService) {
  const nameInput = input({ placeholder: "e.g. laptop, ci-pipeline" });
  const body = field("Key Name", nameInput);

  const footer = h("div", { className: "flex justify-end gap-2 mt-1" });
  footer.appendChild(btn("Cancel", { variant: "outline", onClick: hideModal }));
  footer.appendChild(btn("Create", {
    onClick: async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      const created = await api.keys.create(project.id, service.id, name);
      hideModal();
      showKeyCreatedModal(container, created, service);
    },
  }));

  showModal(modalCard({ title: `New ${service.name} Key`, description: `Create a key scoped to ${project.name} / ${service.name}.`, body, footer }));
}

async function showKeyCreatedModal(container: HTMLElement, created: api.CreatedKey, service: api.McpService) {
  const body = h("div", {});

  // Warning
  const warn = h("div", { className: "bg-warn-soft border border-warn/12 rounded-md px-3 py-2.5 text-[11.5px] text-warn mb-4 flex items-center gap-2" });
  warn.textContent = "Copy now — the key won't be shown again.";
  body.appendChild(warn);

  // Key display
  const keyBox = h("div", { className: "bg-surface-3 border border-edge rounded-md p-3 font-mono text-[11.5px] text-accent break-all leading-relaxed relative mb-3" });
  const keyLabel = h("span", { className: "font-sans text-[9.5px] text-text-3 uppercase tracking-wider block mb-1" }, "API Key");
  const keyValue = h("span", {}, created.key);
  keyBox.appendChild(keyLabel);
  keyBox.appendChild(keyValue);
  const copyBtn = btn("Copy", { variant: "outline", size: "sm", onClick: () => copyToClipboard(created.key, copyBtn) });
  copyBtn.className += " absolute top-2.5 right-2.5";
  keyBox.appendChild(copyBtn);
  body.appendChild(keyBox);

  // CLI command
  const cliLabel = h("div", { className: "text-[10.5px] font-medium text-text-3 uppercase tracking-wider mb-1.5" }, "Claude CLI");
  body.appendChild(cliLabel);
  const domain = await api.getDomain();
  const cliCmd = `claude mcp add --transport http -H "Authorization: Bearer ${created.key}" ${service.id} https://${service.id}.${domain}/mcp`;
  const cliBox = h("div", { className: "bg-surface-3 border border-edge rounded-md p-3 font-mono text-[11.5px] text-accent break-all leading-relaxed relative" });
  const cliValue = h("span", {}, cliCmd);
  cliBox.appendChild(cliValue);
  const cliCopy = btn("Copy", { variant: "outline", size: "sm", onClick: () => copyToClipboard(cliCmd, cliCopy) });
  cliCopy.className += " absolute top-2.5 right-2.5";
  cliBox.appendChild(cliCopy);
  body.appendChild(cliBox);

  const footer = h("div", { className: "flex justify-end mt-2" });
  footer.appendChild(btn("Done", {
    onClick: () => {
      hideModal();
      renderWorkbench(container.closest("#app")! as HTMLElement);
    },
  }));

  showModal(modalCard({ title: "Key Created", body, footer }));
}

function showCredentialFormModal(container: HTMLElement, project: api.Project, service: api.McpService) {
  const body = h("div", {});
  const inputs: { key: string; input: HTMLInputElement }[] = [];

  for (const f of service.credentialsSchema || []) {
    const inp = input({ placeholder: f.label, type: "password" });
    inputs.push({ key: f.key, input: inp });
    body.appendChild(field(f.label + (f.required ? " *" : ""), inp));
  }

  const footer = h("div", { className: "flex justify-end gap-2 mt-1" });
  footer.appendChild(btn("Cancel", { variant: "outline", onClick: hideModal }));
  footer.appendChild(btn("Save", {
    onClick: async () => {
      const creds: Record<string, string> = {};
      for (const { key, input: inp } of inputs) {
        const val = inp.value.trim();
        if (val) creds[key] = val;
      }
      try {
        await api.credentials.set(project.id, service.id, creds);
        hideModal();
        renderWorkbench(container.closest("#app")! as HTMLElement);
      } catch (e) {
        alert((e as Error).message);
      }
    },
  }));

  showModal(modalCard({
    title: `${service.name} Credentials`,
    description: `Set credentials for ${project.name}. These are shared across all keys in this project.`,
    body,
    footer,
  }));
}
