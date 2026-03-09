import * as api from "../api";
import { h } from "../components/ui";

export async function renderDashboard(root: HTMLElement) {
  root.innerHTML = "";

  const domain = await api.getDomain();

  // Fetch counts
  let tokenCount = 0;
  let mcpKeyCount = 0;
  try {
    const tokens = await api.runnerTokens.list();
    tokenCount = tokens.length;
  } catch { /* runner unavailable */ }

  try {
    const projects = await api.projects.list();
    // Sum keys across all projects/services
    const services = await api.services.list();
    for (const project of projects) {
      for (const svc of services) {
        try {
          const keys = await api.keys.list(project.id, svc.id);
          mcpKeyCount += keys.length;
        } catch { /* no keys */ }
      }
    }
  } catch { /* no projects */ }

  // Metrics grid
  const grid = h("div", { className: "grid grid-cols-4 gap-3 mb-5" });

  const metrics = [
    { label: "Runner Keys", value: String(tokenCount), sub: `${tokenCount} active` },
    { label: "MCP Keys", value: String(mcpKeyCount), sub: `${mcpKeyCount} active` },
    { label: "Endpoint", value: domain ? `claude-runner.${domain}` : "-", sub: "via Cloudflare Tunnel", small: true },
    { label: "Auth", value: "API Keys", sub: "X-API-Key (runner) / Bearer (MCP)", small: true },
  ];

  for (const m of metrics) {
    const card = h("div", { className: "bg-surface-2 border border-edge rounded-lg p-4 flex flex-col gap-1.5" });
    card.appendChild(h("span", { className: "text-[11px] text-text-3 uppercase tracking-wider" }, m.label));
    card.appendChild(h("span", {
      className: `font-semibold leading-none tracking-tight ${m.small ? "text-xs mt-2 text-text-1 break-all" : "text-[28px]"}`,
    }, m.value));
    card.appendChild(h("span", { className: "text-[11px] text-text-3" }, m.sub));
    grid.appendChild(card);
  }

  root.appendChild(grid);

  // Quick links
  const links = h("div", { className: "bg-surface-2 border border-edge rounded-lg overflow-hidden" });
  links.appendChild(h("div", { className: "px-4 py-3 border-b border-edge" },
    h("span", { className: "text-xs font-medium text-text-1" }, "Quick Links"),
  ));
  const linkList = h("div", { className: "p-4 flex flex-col gap-2" });
  const linkData = [
    { label: "Grafana", href: domain ? `https://grafana.${domain}` : "#" },
    { label: "ArgoCD", href: domain ? `https://argocd.${domain}` : "#" },
    { label: "GitHub Org", href: "https://github.com/DigiBugCat" },
  ];
  for (const l of linkData) {
    const a = document.createElement("a");
    a.href = l.href;
    a.target = "_blank";
    a.className = "text-text-1 text-xs hover:text-accent transition-colors";
    a.textContent = l.label;
    linkList.appendChild(a);
  }
  links.appendChild(linkList);
  root.appendChild(links);
}
