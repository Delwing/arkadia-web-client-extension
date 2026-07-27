import { marked, type MarkedExtension } from "marked";
import Modal from "bootstrap/js/dist/modal";
import overviewMd from "../../docs/OVERVIEW.md?raw";
import combatMd from "../../docs/COMBAT.md?raw";
import navigationMd from "../../docs/NAVIGATION.md?raw";
import inventoryMd from "../../docs/INVENTORY.md?raw";
import trackingMd from "../../docs/TRACKING.md?raw";
import herbsMd from "../../docs/HERBS.md?raw";
import bindsMd from "../../docs/BINDS.md?raw";
import shortcutsMd from "../../docs/SHORTCUTS.md?raw";
import aliasesMd from "../../docs/ALIASES.md?raw";
import synchronizacjaMd from "../../docs/SYNCHRONIZACJA.md?raw";
import skryptyMd from "../../docs/SKRYPTY.md?raw";
import { objectListDocHtml, objectListDocInit } from "./objectListDoc";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .trim();
}

const renderer: MarkedExtension = {
  renderer: {
    heading({ text, depth }) {
      const id = slugify(text);
      return `<h${depth} id="${id}">${text}</h${depth}>\n`;
    },
  },
};

marked.use(renderer);

interface DocDef {
  key: string;
  title: string;
  md?: string;
  html?: string;
  init?: (container: HTMLElement) => void;
}
const docs: DocDef[] = [
  { key: "overview", title: "Przeglad", md: overviewMd },
  { key: "combat", title: "Walka", md: combatMd },
  { key: "objectlist", title: "Lista obiektow", html: objectListDocHtml, init: objectListDocInit },
  { key: "navigation", title: "Mapa i nawigacja", md: navigationMd },
  { key: "inventory", title: "Ekwipunek", md: inventoryMd },
  { key: "tracking", title: "Postepy", md: trackingMd },
  { key: "herbs", title: "Ziola", md: herbsMd },
  { key: "binds", title: "Bindowanie", md: bindsMd },
  { key: "shortcuts", title: "Skroty lokacji", md: shortcutsMd },
  { key: "aliases", title: "Inne", md: aliasesMd },
  { key: "sync", title: "Synchronizacja", md: synchronizacjaMd },
  { key: "skrypty", title: "Skrypty i automatyzacja", md: skryptyMd }
];

interface SearchResult {
  doc: DocDef;
  line: string;
}

function searchDocs(query: string): SearchResult[] {
  if (!query || query.length < 2) return [];
  const lowerQuery = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const doc of docs) {
    if (doc.key === "overview" || !doc.md) continue;
    const lines = doc.md.split("\n");
    for (const line of lines) {
      if (line.startsWith("#")) continue;
      if (line.toLowerCase().includes(lowerQuery)) {
        results.push({ doc, line: line.trim() });
        if (results.length >= 20) return results;
      }
    }
  }
  return results;
}

function formatSearchResults(results: SearchResult[], query: string): string {
  if (results.length === 0) {
    return `<p class="text-muted">Brak wynikow dla "${query}"</p>`;
  }

  const grouped = new Map<string, string[]>();
  for (const r of results) {
    if (!grouped.has(r.doc.title)) {
      grouped.set(r.doc.title, []);
    }
    grouped.get(r.doc.title)!.push(r.line);
  }

  let html = "";
  for (const [title, lines] of grouped) {
    html += `<h3>${title}</h3><ul>`;
    for (const line of lines) {
      const escaped = line
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\|/g, "")
        .replace(/`([^`]+)`/g, "<code>$1</code>");
      html += `<li>${escaped}</li>`;
    }
    html += "</ul>";
  }
  return html;
}

/**
 * The inner docs UI (nav + search + content), rendered as a Bootstrap dropdown
 * nav — used by the stock modal, which loads full Bootstrap so the dropdown
 * toggles.
 */
function docsBodyHtml(): string {
  return `
<div class="d-flex gap-2 align-items-center flex-wrap">
  <div class="dropdown docs-nav">
    <button class="btn btn-secondary dropdown-toggle" type="button" id="docs-menu" data-bs-toggle="dropdown">
      Wybierz dokument
    </button>
    <ul class="dropdown-menu">
      ${docs
        .map(
          (d) =>
            `<li><a class="dropdown-item" href="#" data-key="${d.key}">${d.title}</a></li>`,
        )
        .join("")}
    </ul>
  </div>
  <input type="text" id="docs-search" class="form-control form-control-sm" style="max-width: 200px;" placeholder="Szukaj...">
</div>
<div id="docs-content" class="docs-content flex-fill overflow-auto"></div>`;
}

/**
 * The inner docs UI rendered with a plain button-row nav instead of a Bootstrap
 * dropdown — used by hosts (e.g. forge-ui) that do not load Bootstrap's dropdown
 * JS. The nav still exposes `.docs-nav [data-key]`, so `wireDocs` handles both.
 */
function docsBodyHtmlPlain(): string {
  return `
<div class="d-flex gap-2 align-items-center flex-wrap docs-toolbar">
  <div class="docs-nav d-flex gap-1 flex-wrap">
    ${docs
      .map(
        (d) =>
          `<button type="button" class="btn btn-secondary btn-sm" data-key="${d.key}">${d.title}</button>`,
      )
      .join("")}
  </div>
  <input type="text" id="docs-search" class="form-control form-control-sm ms-auto" style="max-width: 200px;" placeholder="Szukaj...">
</div>
<div id="docs-content" class="docs-content flex-fill overflow-auto"></div>`;
}

/**
 * Wire the docs behaviour (doc switching, in-doc anchor scroll, search) onto an
 * already-populated container. Tolerant of a missing dropdown label (`#docs-menu`)
 * so it drives both the stock dropdown nav and the plain button-row nav.
 */
function wireDocs(root: HTMLElement): { showDoc: (key: string) => void } {
  const content = root.querySelector("#docs-content") as HTMLElement;
  const toggleBtn = root.querySelector("#docs-menu") as HTMLButtonElement | null;
  const searchInput = root.querySelector("#docs-search") as HTMLInputElement | null;
  const navButtons = Array.from(
    root.querySelectorAll(".docs-nav [data-key]"),
  ) as HTMLElement[];

  let currentDoc = docs[0].key;

  const setNavLabel = (text: string) => {
    if (toggleBtn) toggleBtn.textContent = text;
  };

  content.addEventListener("click", (e) => {
    const link = (e.target as HTMLElement).closest("a");
    if (!link) return;
    const href = link.getAttribute("href");
    if (!href || !href.startsWith("#")) return;
    e.preventDefault();
    const target = content.querySelector(href);
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
    }
  });

  async function showDoc(key: string, clearSearch = true) {
    const doc = docs.find((d) => d.key === key);
    if (!doc) return;
    currentDoc = key;
    if (doc.html) {
      content.innerHTML = doc.html;
      doc.init?.(content);
    } else if (doc.md) {
      const html = await marked.parse(doc.md);
      content.innerHTML = html as string;
    }
    setNavLabel(doc.title);
    if (clearSearch && searchInput) {
      searchInput.value = "";
    }
    navButtons.forEach((btn) =>
      btn.classList.toggle("active", btn.dataset.key === key),
    );
  }

  function doSearch(query: string) {
    if (query.length < 2) {
      showDoc(currentDoc, false);
      return;
    }
    const results = searchDocs(query);
    content.innerHTML = formatSearchResults(results, query);
    setNavLabel("Wyniki wyszukiwania");
  }

  if (searchInput) {
    let searchTimeout: number | undefined;
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimeout);
      searchTimeout = window.setTimeout(() => {
        doSearch(searchInput.value.trim());
      }, 150);
    });
  }

  navButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      showDoc((btn as HTMLElement).dataset.key!);
    });
  });

  return { showDoc: (key: string) => void showDoc(key) };
}

function createModal() {
  const modalEl = document.createElement("div");
  modalEl.id = "docs-modal";
  modalEl.className = "modal fade";
  modalEl.tabIndex = -1;
  modalEl.innerHTML = `
<div class="modal-dialog modal-xl modal-dialog-scrollable">
  <div class="modal-content">
    <div class="modal-header">
      <h5 class="modal-title">Dokumentacja</h5>
      <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body d-flex flex-column gap-3">${docsBodyHtml()}</div>
  </div>
</div>`;
  document.body.appendChild(modalEl);
  const modal = new Modal(modalEl);
  return { modalEl, modal };
}

function initDocs() {
  const docsButton = document.getElementById(
    "docs-button",
  ) as HTMLButtonElement | null;
  if (!docsButton) return;

  const { modalEl, modal } = createModal();
  const body = modalEl.querySelector(".modal-body") as HTMLElement;
  const { showDoc } = wireDocs(body);

  docsButton.addEventListener("click", () => {
    showDoc(docs[0].key);
    modal.show();
  });
}

document.addEventListener("DOMContentLoaded", initDocs);

/**
 * Render the documentation UI into an arbitrary container (no Bootstrap modal).
 * Used by alternative UIs (forge-ui) that host the docs inside their own modal
 * shell. Populates `container` and shows the first document.
 */
export function mountDocs(container: HTMLElement): void {
  container.classList.add("d-flex", "flex-column", "gap-3");
  container.innerHTML = docsBodyHtmlPlain();
  const { showDoc } = wireDocs(container);
  showDoc(docs[0].key);
}
