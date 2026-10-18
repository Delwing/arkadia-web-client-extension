import overviewMd from "../../../docs/OVERVIEW.md?raw";
import combatMd from "../../../docs/COMBAT.md?raw";
import navigationMd from "../../../docs/NAVIGATION.md?raw";
import inventoryMd from "../../../docs/INVENTORY.md?raw";
import trackingMd from "../../../docs/TRACKING.md?raw";
import herbsMd from "../../../docs/HERBS.md?raw";
import bindsMd from "../../../docs/BINDS.md?raw";
import shortcutsMd from "../../../docs/SHORTCUTS.md?raw";
import aliasesMd from "../../../docs/ALIASES.md?raw";
import synchronizacjaMd from "../../../docs/SYNCHRONIZACJA.md?raw";
import skryptyMd from "../../../docs/SKRYPTY.md?raw";
import automatyzacjeMd from "../../../docs/AUTOMATYZACJE.md?raw";
import polaczenieMd from "../../../docs/POLACZENIE.md?raw";
import daneMd from "../../../docs/DANE.md?raw";
import { objectListDocHtml, objectListDocInit } from "../objectListDoc";

/** Screenshots under docs/img, emitted as assets; pages link them as `img/...`. */
const IMAGES = import.meta.glob<string>("../../../docs/img/**/*.png", { eager: true, query: "?url", import: "default" });

/** Diagrams under docs/img, inlined so they draw in the window's own colours (see .doc-dg). */
const DIAGRAMS = import.meta.glob<string>("../../../docs/img/**/*.svg", { eager: true, query: "?raw", import: "default" });

/**
 * Points a page's `](img/...)` links at the built image, so they resolve wherever the window opens;
 * an `.svg` image on a line of its own becomes the inline diagram, its alt text the tooltip.
 */
const withImages = (md: string) =>
  md
    .replace(/^!\[([^\]]*)\]\((img\/[^)\s]+\.svg)\)$/gm, (line, alt: string, src: string) => {
      const svg = DIAGRAMS[`../../../docs/${src}`];
      return svg ? `<figure class="doc-diagram" title="${alt}">${svg.trim().replace(/\n\s*/g, "")}</figure>` : line;
    })
    .replace(/\]\((img\/[^)\s]+)\)/g, (_, src: string) => `](${IMAGES[`../../../docs/${src}`] ?? src})`);

/** Where a page sits in the table of contents. */
export type DocGroup = "Start" | "Gra" | "Klient";

export interface DocPageDef {
  key: string;
  title: string;
  group: DocGroup;
  /** Markdown source; or `html` + `init` for a page that draws its own demos. */
  md?: string;
  html?: string;
  init?: (container: HTMLElement) => void;
}

/** Every page of Dokumentacja, in table-of-contents order. */
export const DOC_PAGES: DocPageDef[] = [
  { key: "overview", title: "Przegląd", group: "Start", md: overviewMd },
  { key: "combat", title: "Walka", group: "Gra", md: combatMd },
  { key: "objectlist", title: "Lista obiektów", group: "Gra", html: objectListDocHtml, init: objectListDocInit },
  { key: "navigation", title: "Mapa i nawigacja", group: "Gra", md: navigationMd },
  { key: "inventory", title: "Ekwipunek", group: "Gra", md: inventoryMd },
  { key: "tracking", title: "Postępy", group: "Gra", md: trackingMd },
  { key: "herbs", title: "Zioła", group: "Gra", md: herbsMd },
  { key: "binds", title: "Bindowanie", group: "Klient", md: bindsMd },
  { key: "shortcuts", title: "Skróty lokacji", group: "Klient", md: shortcutsMd },
  { key: "automatyzacje", title: "Skrypty", group: "Klient", md: withImages(automatyzacjeMd) },
  { key: "skrypty", title: "Wtyczki", group: "Klient", md: skryptyMd },
  { key: "polaczenie", title: "Połączenie", group: "Klient", md: withImages(polaczenieMd) },
  { key: "dane", title: "Dane", group: "Klient", md: daneMd },
  { key: "sync", title: "Synchronizacja", group: "Klient", md: synchronizacjaMd },
  { key: "aliases", title: "Inne komendy", group: "Klient", md: aliasesMd },
];
