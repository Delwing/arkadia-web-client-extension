import { marked } from "marked";
import Modal from "bootstrap/js/dist/modal";
import aliasesMd from "../../docs/ALIASES.md?raw";
import bagManagerMd from "../../docs/BAG_MANAGER.md?raw";
import bindsMd from "../../docs/BINDS.md?raw";
import herbsMd from "../../docs/HERBS.md?raw";
import shortcutsMd from "../../docs/SHORTCUTS.md?raw";

interface DocDef {
  key: string;
  title: string;
  md: string;
}
const docs: DocDef[] = [
  { key: "aliases", title: "Aliasy", md: aliasesMd },
  { key: "bag", title: "Mened\u017cer pojemnik\u00f3w", md: bagManagerMd },
  { key: "binds", title: "Bindowanie", md: bindsMd },
  { key: "herbs", title: "Licznik z\u00f3\u0142", md: herbsMd },
  { key: "shortcuts", title: "Skr\u00f3ty", md: shortcutsMd }
];

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
      <div class="dropdown docs-nav align-self-start">
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
  const navButtons = Array.from(
    modalEl.querySelectorAll(".docs-nav [data-key]"),
  ) as HTMLElement[];

  async function showDoc(key: string) {
    const doc = docs.find((d) => d.key === key);
    if (!doc) return;
    const html = await marked.parse(doc.md);
    content.innerHTML = html as string;
    toggleBtn.textContent = doc.title;
    modal.show();
  }

  navButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      showDoc((btn as HTMLElement).dataset.key!);
    });
  });

  docsButton.addEventListener("click", () => showDoc(docs[0].key));
}

document.addEventListener("DOMContentLoaded", initDocs);
