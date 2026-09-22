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
import { objectListDocHtml, objectListDocInit } from "../objectListDoc";

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
  { key: "skrypty", title: "Skrypty i automatyzacja", group: "Klient", md: skryptyMd },
  { key: "sync", title: "Synchronizacja", group: "Klient", md: synchronizacjaMd },
  { key: "aliases", title: "Inne komendy", group: "Klient", md: aliasesMd },
];
