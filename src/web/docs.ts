import { marked } from "marked";
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

interface DocDef {
  key: string;
  title: string;
  md: string;
}
const docs: DocDef[] = [
  { key: "overview", title: "Przeglad", md: overviewMd },
  { key: "combat", title: "Walka", md: combatMd },
  { key: "navigation", title: "Mapa i nawigacja", md: navigationMd },
  { key: "inventory", title: "Ekwipunek", md: inventoryMd },
  { key: "tracking", title: "Postepy", md: trackingMd },
  { key: "herbs", title: "Ziola", md: herbsMd },
  { key: "binds", title: "Bindowanie", md: bindsMd },
  { key: "shortcuts", title: "Skroty lokacji", md: shortcutsMd },
  { key: "aliases", title: "Inne", md: aliasesMd }
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
    if (doc.key === "overview") continue;
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
    <div class="modal-body d-flex flex-column gap-3">
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
      <div id="docs-content" class="docs-content flex-fill overflow-auto"></div>
    </div>
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
  const content = modalEl.querySelector("#docs-content") as HTMLElement;
  const toggleBtn = modalEl.querySelector("#docs-menu") as HTMLButtonElement;
  const searchInput = modalEl.querySelector("#docs-search") as HTMLInputElement;
  const navButtons = Array.from(
    modalEl.querySelectorAll(".docs-nav [data-key]"),
  ) as HTMLElement[];

  let currentDoc = docs[0].key;

  async function showDoc(key: string, clearSearch = true) {
    const doc = docs.find((d) => d.key === key);
    if (!doc) return;
    currentDoc = key;
    const html = await marked.parse(doc.md);
    content.innerHTML = html as string;
    toggleBtn.textContent = doc.title;
    if (clearSearch) {
      searchInput.value = "";
    }
  }

  function doSearch(query: string) {
    if (query.length < 2) {
      showDoc(currentDoc, false);
      return;
    }
    const results = searchDocs(query);
    content.innerHTML = formatSearchResults(results, query);
    toggleBtn.textContent = "Wyniki wyszukiwania";
  }

  let searchTimeout: number | undefined;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = window.setTimeout(() => {
      doSearch(searchInput.value.trim());
    }, 150);
  });

  navButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      showDoc((btn as HTMLElement).dataset.key!);
    });
  });

  docsButton.addEventListener("click", () => {
    showDoc(docs[0].key);
    modal.show();
  });
}

document.addEventListener("DOMContentLoaded", initDocs);
