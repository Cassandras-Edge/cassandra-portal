import "./style.css";
import { getUserEmailFromCookie } from "./api";
import { renderDashboard } from "./pages/dashboard";
import { renderWorkbench } from "./pages/workbench";
import { renderRunnerKeys } from "./pages/runner-keys";

type Page = "dashboard" | "workbench" | "runner-keys";

let currentPage: Page = "workbench";

function render() {
  const app = document.getElementById("app")!;
  app.innerHTML = "";

  // Top bar
  const topbar = document.createElement("header");
  topbar.className =
    "h-11 bg-surface-1 border-b border-edge flex items-center px-5 gap-6 sticky top-0 z-20";

  // Brand
  const brand = document.createElement("div");
  brand.className = "text-sm font-semibold text-accent tracking-tight mr-2 flex items-center gap-2";
  const dot = document.createElement("span");
  dot.className = "w-1.5 h-1.5 bg-accent rounded-full shadow-[0_0_8px_var(--color-accent)]";
  brand.appendChild(dot);
  brand.appendChild(document.createTextNode("Cassandra"));
  topbar.appendChild(brand);

  // Nav
  const nav = document.createElement("nav");
  nav.className = "flex gap-0.5 flex-1";
  const pages: { id: Page; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "workbench", label: "Workbench" },
    { id: "runner-keys", label: "Runner Keys" },
  ];
  for (const p of pages) {
    const tab = document.createElement("a");
    tab.className = `px-4 py-2 rounded-md text-[12.5px] transition-all ${
      currentPage === p.id
        ? "bg-accent-soft text-accent font-medium"
        : "text-text-2 hover:bg-surface-3 hover:text-text-1"
    }`;
    tab.textContent = p.label;
    tab.href = "#";
    tab.addEventListener("click", (e) => {
      e.preventDefault();
      currentPage = p.id;
      render();
    });
    nav.appendChild(tab);
  }
  topbar.appendChild(nav);

  // User
  const email = getUserEmailFromCookie();
  const user = document.createElement("div");
  user.className = "text-[11.5px] text-text-3 flex items-center gap-2";
  const avatar = document.createElement("div");
  avatar.className =
    "w-6 h-6 rounded-full bg-surface-4 border border-edge flex items-center justify-center text-[10px] font-semibold text-text-1";
  avatar.textContent = email[0]?.toUpperCase() || "?";
  user.appendChild(avatar);
  user.appendChild(document.createTextNode(email));

  const logout = document.createElement("a");
  logout.href = "/cdn-cgi/access/logout";
  logout.className = "text-[11px] text-text-3 hover:text-text-1 transition-colors ml-1";
  logout.textContent = "Sign out";
  user.appendChild(logout);

  topbar.appendChild(user);

  app.appendChild(topbar);

  // Page content
  const content = document.createElement("div");
  content.className = "p-5 max-w-[1400px] mx-auto";
  content.id = "page-content";
  app.appendChild(content);

  // Render page
  switch (currentPage) {
    case "dashboard":
      renderDashboard(content);
      break;
    case "workbench":
      renderWorkbench(content);
      break;
    case "runner-keys":
      renderRunnerKeys(content);
      break;
  }
}

render();
