import { createContext, useContext } from "react";

/**
 * Set while the footer is drawn as a preview (the footer layout editor): blocks
 * show themselves even with nothing to show yet - the binds with their
 * placeholder, the bind row however empty - and plugin items, whose DOM node
 * belongs to the real footer, stand in as their name.
 */
export const FooterPreviewContext = createContext(false);

export const useFooterPreview = (): boolean => useContext(FooterPreviewContext);

/**
 * What a preview shows where the game has told nothing yet, so every piece of
 * the layout can be seen and placed: vitals away from rest, a few binds and
 * exits. Chips with nothing to show stand in as their name (ChipZone).
 */
export const PREVIEW_CHAR_STATE = {
  hp: 5, fatigue: 3, stuffed: 2, encumbrance: 2, soaked: 2, mana: 5,
  improve: 7, form: 2, intox: 2, headache: 1, panic: 1,
};

export const PREVIEW_BINDS = [
  { index: 1, label: "ALT+1", action: "zerknij na tablice" },
  { index: 2, label: "ALT+2", action: "wejdz do karczmy", kind: "room" as const },
  { index: 3, label: "ALT+3", action: "napij sie z fontanny", kind: "drink" as const },
];

export const PREVIEW_EXITS = { exits: ["polnoc", "wschod", "poludniowy-zachod", "gora", "brama"] };
