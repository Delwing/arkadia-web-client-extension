/**
 * Dokumentacja for forge-ui, which hosts it in its own modal. The stock UI has
 * its own window (src/web/documentation/DocsWindow.tsx) over the same pages.
 */
import { marked, type MarkedExtension } from "marked";
import { DOC_PAGES } from "./documentation/docPages";

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

type DocDef = (typeof DOC_PAGES)[number];
const docs = DOC_PAGES;

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
    return `<p class="popup-muted">Brak wynikow dla "${query}"</p>`;
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
 * The docs UI with a plain button-row nav. The nav still exposes `.docs-nav [data-key]`, so `wireDocs` handles both.
 */
function docsBodyHtmlPlain(): string {
  return `
<div class="popup-row docs-toolbar">
  <div class="docs-nav">
    ${docs
      .map(
        (d) =>
          `<button type="button" class="popup-btn popup-btn--control popup-btn--sm" data-key="${d.key}">${d.title}</button>`,
      )
      .join("")}
  </div>
  <input type="text" id="docs-search" class="popup-input popup-input--control docs-search" placeholder="Szukaj...">
</div>
<div id="docs-content" class="docs-content docs-content--fill"></div>`;
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
      btn.classList.toggle("popup-btn--solid", btn.dataset.key === key),
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

/**
 * Render the documentation UI into an arbitrary container.
 * Used by alternative UIs (forge-ui) that host the docs inside their own modal
 * shell. Populates `container` and shows the first document.
 */
export function mountDocs(container: HTMLElement): void {
  container.classList.add("popup-stack", "docs-root");
  container.innerHTML = docsBodyHtmlPlain();
  const { showDoc } = wireDocs(container);
  showDoc(docs[0].key);
}
