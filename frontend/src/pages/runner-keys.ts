import * as api from "../api";
import { h, btn, input, field, mono, emptyState, fmtDate, copyToClipboard } from "../components/ui";
import { showModal, hideModal, modalCard } from "../components/modal";

export async function renderRunnerKeys(root: HTMLElement) {
  root.innerHTML = "";

  let tokens: api.RunnerToken[] = [];
  try {
    tokens = await api.runnerTokens.list();
  } catch (e) {
    root.appendChild(emptyState(`Failed to load: ${(e as Error).message}`));
    return;
  }

  // Header bar
  const bar = h("div", { className: "flex justify-between items-center mb-4" });
  bar.appendChild(h("span", { className: "text-xs text-text-3" },
    h("strong", { className: "text-text-1" }, String(tokens.length)),
    ` runner key${tokens.length !== 1 ? "s" : ""}`,
  ));
  bar.appendChild(btn("+ New Runner Key", { onClick: () => showCreateRunnerModal(root) }));
  root.appendChild(bar);

  if (tokens.length === 0) {
    root.appendChild(emptyState("No runner keys yet. Create one to get started."));
    return;
  }

  // Table
  const table = document.createElement("table");
  table.className = "w-full border-collapse bg-surface-2 border border-edge rounded-lg overflow-hidden";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const col of ["Name", "Namespace", "Max Sessions", "Created", ""]) {
    const th = document.createElement("th");
    th.className = "text-left px-4 py-2.5 text-[10.5px] font-medium text-text-3 uppercase tracking-wider bg-surface-3 border-b border-edge";
    th.textContent = col;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const t of tokens) {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-accent-soft/30";

    const cells = [
      { text: t.name, className: "font-medium" },
      { el: mono(t.namespace) },
      { text: String(t.max_sessions) },
      { text: fmtDate(t.created_at), className: "text-text-3" },
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
          if (!confirm(`Delete runner key "${t.name}"?`)) return;
          await api.runnerTokens.delete(t.id);
          renderRunnerKeys(root);
        },
      }),
    );
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  root.appendChild(table);
}

function showCreateRunnerModal(root: HTMLElement) {
  const nameInput = input({ placeholder: "e.g. andrew-laptop, ci-pipeline" });
  const body = field("Name", nameInput);

  const footer = h("div", { className: "flex justify-end gap-2 mt-1" });
  footer.appendChild(btn("Cancel", { variant: "outline", onClick: hideModal }));
  footer.appendChild(btn("Create", {
    onClick: async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      const created = await api.runnerTokens.create(name);
      hideModal();

      // Show result
      const resultBody = h("div", {});
      const warn = h("div", { className: "bg-warn-soft border border-warn/12 rounded-md px-3 py-2.5 text-[11.5px] text-warn mb-4" });
      warn.textContent = "Copy now — the key won't be shown again.";
      resultBody.appendChild(warn);

      // API Key
      const keyBox = h("div", { className: "bg-surface-3 border border-edge rounded-md p-3 font-mono text-[11.5px] text-accent break-all leading-relaxed relative mb-3" });
      keyBox.appendChild(h("span", { className: "font-sans text-[9.5px] text-text-3 uppercase tracking-wider block mb-1" }, "API Key"));
      keyBox.appendChild(h("span", {}, created.api_key || ""));
      const copyBtn = btn("Copy", { variant: "outline", size: "sm", onClick: () => copyToClipboard(created.api_key || "", copyBtn) });
      copyBtn.className += " absolute top-2.5 right-2.5";
      keyBox.appendChild(copyBtn);
      resultBody.appendChild(keyBox);

      // Tenant ID
      const idBox = h("div", { className: "bg-surface-3 border border-edge rounded-md p-3 font-mono text-[11.5px] text-accent break-all leading-relaxed" });
      idBox.appendChild(h("span", { className: "font-sans text-[9.5px] text-text-3 uppercase tracking-wider block mb-1" }, "Tenant ID"));
      idBox.appendChild(h("span", {}, created.id));
      resultBody.appendChild(idBox);

      const resultFooter = h("div", { className: "flex justify-end mt-2" });
      resultFooter.appendChild(btn("Done", { onClick: () => { hideModal(); renderRunnerKeys(root); } }));

      showModal(modalCard({ title: "Key Created", body: resultBody, footer: resultFooter }));
    },
  }));

  showModal(modalCard({ title: "New Runner Key", description: "Create a new tenant with an API key for runner access.", body, footer }));
}
