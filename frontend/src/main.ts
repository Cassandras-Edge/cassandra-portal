import "./style.css";
import { getUserEmailFromCookie } from "./api";
import { renderServiceDetail } from "./pages/workbench";
import { renderRunnerKeys } from "./pages/runner-keys";
import * as api from "./api";

type Page = "services" | "runner-keys";

let currentPage: Page = "services";
let allProjects: api.Project[] = [];
let allServices: api.McpService[] = [];
let currentProject: api.Project | null = null;
let currentService: api.McpService | null = null;

export function getState() {
  return { currentProject, currentService, allProjects, allServices };
}

export function setCurrentService(svc: api.McpService | null) {
  currentService = svc;
  render();
}

export function setCurrentProject(project: api.Project | null) {
  currentProject = project;
  currentService = null;
  render();
}

async function loadData() {
  [allProjects, allServices] = await Promise.all([api.projects.list(), api.services.list()]);
  if (!currentProject && allProjects.length > 0) currentProject = allProjects[0];
  if (!currentService && allServices.length > 0) currentService = allServices[0];
}

function render() {
  const app = document.getElementById("app")!;
  app.innerHTML = "";
  app.className = "h-screen flex flex-col overflow-hidden";

  // ── Top Bar ──
  const topbar = document.createElement("header");
  topbar.className =
    "h-11 bg-surface-1 border-b border-edge flex items-center px-4 gap-3 shrink-0 z-20";

  // Brand
  const brand = document.createElement("div");
  brand.className = "text-[13px] font-semibold text-accent tracking-tight flex items-center gap-2 mr-3";
  const dot = document.createElement("span");
  dot.className = "w-[5px] h-[5px] bg-accent rounded-full shadow-[0_0_8px_var(--color-accent)]";
  brand.appendChild(dot);
  brand.appendChild(document.createTextNode("Cassandra"));
  topbar.appendChild(brand);

  // Spacer
  const spacer = document.createElement("div");
  spacer.className = "flex-1";
  topbar.appendChild(spacer);

  // Project switcher
  const projectPill = document.createElement("select");
  projectPill.className =
    "bg-surface-2 border border-edge rounded-md px-2.5 py-1 text-[11px] text-text-0 outline-hidden focus:border-accent font-[family-name:var(--font-sans)]";
  for (const p of allProjects) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.kind === "personal" ? p.name : p.name;
    if (currentProject && p.id === currentProject.id) opt.selected = true;
    projectPill.appendChild(opt);
  }
  projectPill.addEventListener("change", () => {
    currentProject = allProjects.find((p) => p.id === projectPill.value) || null;
    currentService = allServices[0] || null;
    render();
  });
  topbar.appendChild(projectPill);

  // User
  const email = getUserEmailFromCookie();
  const userDiv = document.createElement("div");
  userDiv.className = "flex items-center gap-2 text-[11px] text-text-3";
  const avatar = document.createElement("div");
  avatar.className =
    "w-[22px] h-[22px] rounded-full bg-surface-4 border border-edge flex items-center justify-center text-[9px] font-semibold text-text-1";
  avatar.textContent = email[0]?.toUpperCase() || "?";
  userDiv.appendChild(avatar);
  userDiv.appendChild(document.createTextNode(email));
  const logout = document.createElement("a");
  logout.href = "/cdn-cgi/access/logout";
  logout.className = "text-[10.5px] text-text-3 hover:text-text-1 transition-colors ml-1";
  logout.textContent = "Sign out";
  userDiv.appendChild(logout);
  topbar.appendChild(userDiv);

  app.appendChild(topbar);

  // ── Layout ──
  const layout = document.createElement("div");
  layout.className = "flex flex-1 overflow-hidden";

  // Icon sidebar
  const iconSidebar = document.createElement("div");
  iconSidebar.className = "w-12 bg-surface-1 border-r border-edge flex flex-col items-center pt-2 gap-1 shrink-0";

  const svcIcon = makeIconBtn(
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-[18px] h-[18px]"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3h-8l-2 4h12z"/></svg>`,
    "Services",
    currentPage === "services",
    () => { currentPage = "services"; render(); },
  );
  iconSidebar.appendChild(svcIcon);

  const runnerIcon = makeIconBtn(
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-[18px] h-[18px]"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`,
    "Runner Keys",
    currentPage === "runner-keys",
    () => { currentPage = "runner-keys"; render(); },
  );
  iconSidebar.appendChild(runnerIcon);

  layout.appendChild(iconSidebar);

  if (currentPage === "services") {
    // Service sidebar
    const sidebar = document.createElement("div");
    sidebar.className = "w-[210px] bg-surface-1 border-r border-edge flex flex-col shrink-0 overflow-y-auto";

    const sidebarHeader = document.createElement("div");
    sidebarHeader.className = "px-3.5 py-2.5 text-[10px] font-semibold text-text-3 uppercase tracking-wider border-b border-edge";
    sidebarHeader.textContent = "Explorer";
    sidebar.appendChild(sidebarHeader);

    const sidebarBody = document.createElement("div");
    sidebarBody.className = "p-2 flex flex-col gap-0.5";

    const sectionLabel = document.createElement("div");
    sectionLabel.className = "px-2 py-1.5 text-[9.5px] font-medium text-text-3 uppercase tracking-wider flex items-center gap-1";
    sectionLabel.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-[10px] h-[10px]"><polyline points="6 9 12 15 18 9"/></svg> Services`;
    sidebarBody.appendChild(sectionLabel);

    for (const svc of allServices) {
      const item = document.createElement("div");
      const isActive = currentService?.id === svc.id;
      item.className = `flex items-center gap-2 px-2.5 py-[7px] rounded-md text-[12px] transition-all cursor-pointer ${
        isActive
          ? "bg-accent-soft text-accent font-medium"
          : "text-text-2 hover:bg-surface-3 hover:text-text-1"
      }`;

      // Status dot
      const statusDot = document.createElement("span");
      statusDot.className = `w-1.5 h-1.5 rounded-full shrink-0 ${svc.status === "active" ? "bg-ok" : "bg-text-3"}`;
      item.appendChild(statusDot);

      // Name
      item.appendChild(document.createTextNode(svc.name));

      // Tool count
      const count = document.createElement("span");
      count.className = "ml-auto text-[10px] text-text-3 bg-surface-3 px-1.5 py-px rounded-full";
      count.textContent = String(svc.tools?.length || 0);
      item.appendChild(count);

      // Config indicator
      if (svc.credentialsSchema && svc.credentialsSchema.length > 0) {
        const configDot = document.createElement("span");
        configDot.className = "w-1.5 h-1.5 rounded-full shrink-0";
        // We'll check config status after render
        configDot.id = `config-dot-${svc.id}`;
        configDot.title = "Checking config...";
        item.appendChild(configDot);
      }

      item.addEventListener("click", () => {
        currentService = svc;
        render();
      });
      sidebarBody.appendChild(item);
    }

    sidebar.appendChild(sidebarBody);
    layout.appendChild(sidebar);

    // Main content
    const content = document.createElement("div");
    content.className = "flex-1 overflow-y-auto";
    content.id = "main-content";
    layout.appendChild(content);

    // Render service detail after layout is in DOM
    app.appendChild(layout);

    if (currentService && currentProject) {
      renderServiceDetail(content, currentProject, currentService);
      // Check config status for sidebar indicators
      checkConfigStatus();
    }
  } else {
    // Runner keys — full width
    const content = document.createElement("div");
    content.className = "flex-1 overflow-y-auto p-6 max-w-[1000px]";
    content.id = "main-content";
    layout.appendChild(content);
    app.appendChild(layout);
    renderRunnerKeys(content);
  }
}

function makeIconBtn(svgHtml: string, title: string, active: boolean, onClick: () => void): HTMLElement {
  const btn = document.createElement("div");
  btn.className = `w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer transition-all relative ${
    active ? "text-accent bg-accent-soft" : "text-text-3 hover:bg-surface-3 hover:text-text-1"
  }`;
  if (active) {
    const indicator = document.createElement("span");
    indicator.className = "absolute left-0 top-2 bottom-2 w-0.5 bg-accent rounded-r-sm";
    btn.appendChild(indicator);
  }
  btn.innerHTML += svgHtml;
  btn.title = title;
  btn.addEventListener("click", onClick);
  return btn;
}

async function checkConfigStatus() {
  if (!currentProject) return;
  for (const svc of allServices) {
    if (!svc.credentialsSchema || svc.credentialsSchema.length === 0) continue;
    const dotEl = document.getElementById(`config-dot-${svc.id}`);
    if (!dotEl) continue;
    try {
      const meta = await api.credentials.get(currentProject.id, svc.id);
      if (meta.has_credentials) {
        dotEl.className = "w-1.5 h-1.5 rounded-full shrink-0 bg-ok";
        dotEl.title = "Configuration set";
      } else {
        dotEl.className = "w-1.5 h-1.5 rounded-full shrink-0 bg-warn";
        dotEl.title = "Needs configuration";
      }
    } catch {
      dotEl.className = "w-1.5 h-1.5 rounded-full shrink-0 bg-text-3";
      dotEl.title = "Unknown";
    }
  }
}

// Initial load
loadData().then(() => render());
