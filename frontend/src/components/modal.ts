/** Minimal modal — show/hide with backdrop click to close. */

let overlay: HTMLDivElement | null = null;

function ensureOverlay(): HTMLDivElement {
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.className =
    "fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs hidden";
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) hideModal();
  });
  document.body.appendChild(overlay);
  return overlay;
}

export function showModal(content: HTMLElement) {
  const o = ensureOverlay();
  o.innerHTML = "";
  o.appendChild(content);
  o.classList.remove("hidden");
}

export function hideModal() {
  if (overlay) {
    overlay.classList.add("hidden");
    overlay.innerHTML = "";
  }
}

/** Build a standard modal card with title, description, and footer. */
export function modalCard(opts: {
  title: string;
  description?: string;
  body: HTMLElement;
  footer: HTMLElement;
}): HTMLElement {
  const card = document.createElement("div");
  card.className =
    "bg-surface-1 border border-edge rounded-lg p-6 w-[440px] animate-[slideUp_0.18s_ease]";

  const h3 = document.createElement("h3");
  h3.className = "text-[15px] font-semibold mb-1";
  h3.textContent = opts.title;
  card.appendChild(h3);

  if (opts.description) {
    const p = document.createElement("p");
    p.className = "text-xs text-text-2 mb-5";
    p.textContent = opts.description;
    card.appendChild(p);
  }

  card.appendChild(opts.body);
  card.appendChild(opts.footer);
  return card;
}
