// Brings react-bootstrap's portaled dialogs into forge's modal scope.
//
// The menu-hosted panels open two kinds of sub-dialog. The hand-rolled ones
// (Opcje → "Nadpisania dla wrogów", Aliasy/Triggery → add/edit) render inline,
// inside `.forge-menu-modal`, so the scoped Bootstrap sheet + the forge palette
// in menu.css reach them for free. The react-bootstrap `<Modal>` ones (Interfejs
// → "Zarządzaj dźwiękami", Bindowanie → import, Skrypty, Notatki lokacji) do NOT:
// `<Modal>` portals to `document.body`, which is outside every `.forge-menu-modal
// …` selector we have. They arrive with no Bootstrap and no forge theme at all —
// not merely off-palette but unusable: no fixed positioning, so the dialog lands
// as a bare block at the end of the page, behind forge's own chrome.
//
// The fix is to put the scope root ON the portaled node rather than to move the
// node into the scope. Moving it would be the obvious idea and the wrong one:
// React's portal cleanup calls `container.removeChild(node)`, so a node relocated
// out of `document.body` throws on unmount. Tagging leaves the tree exactly as
// React built it, and because every themed rule we own is written as
// `.forge-menu-modal <descendant>`, the whole dialog body — buttons, inputs,
// tables, the forged `.modal-content` chrome — inherits the theme with no
// duplicated selectors. Only the rules that would target the tagged element
// itself (`.modal` / `.modal-backdrop` layout) can't be inherited that way, so
// menu.css states those by hand against `.forge-portaled-modal`.
//
// Scoped to while a menu modal is open, which is also when the scoped stylesheet
// is loaded — tagging nodes before it exists would achieve nothing anyway.

/** The theming scope every `.forge-menu-modal …` rule keys off. */
const SCOPE_CLASS = 'forge-menu-modal';
/** Marks the tagged node as a portal root, for the own-element rules in menu.css. */
const PORTAL_CLASS = 'forge-portaled-modal';
/** Suppresses transitions inside the dialog for the one recalc that themes it. */
const PRIMING_CLASS = 'forge-portal-priming';

/** Bootstrap's portal roots: the dialog and its backdrop, plus the offcanvas pair. */
const PORTAL_SELECTOR = '.modal, .modal-backdrop, .offcanvas, .offcanvas-backdrop';

function tag(node: Node): void {
    if (!(node instanceof HTMLElement)) return;
    if (!node.matches(PORTAL_SELECTOR)) return;
    if (node.classList.contains(PORTAL_CLASS)) return;
    // Primed, because the theme arrives one microtask after the node does and
    // Bootstrap has already had the browser compute the unthemed style by then:
    // react-bootstrap's fade forces a reflow while mounting, which captures the
    // bare UA look (white buttons) as the baseline for `.btn`'s .15s
    // background/border-colour transition. Tagging alone therefore doesn't paint
    // the dialog forged, it *animates* it from stock to forged. Adding the theme
    // with transitions off, flushing, then restoring them re-baselines every
    // descendant on the forged values without anything to animate — the classic
    // priming trick. See the `.forge-portal-priming` rule in menu.css; it spares
    // `.modal`/`.modal-dialog` so the dialog's own fade-in still plays.
    node.classList.add(SCOPE_CLASS, PORTAL_CLASS, PRIMING_CLASS);
    // The scoped Bootstrap carries its dark theme behind this attribute (the same
    // one MenuModal sets on its dialog); forge's --bs-* overrides recolour it.
    node.setAttribute('data-bs-theme', 'dark');
    void node.offsetHeight;
    node.classList.remove(PRIMING_CLASS);
}

let observer: MutationObserver | null = null;
/** Menu modals stack, so opens/closes are ref-counted rather than paired 1:1. */
let holders = 0;

/**
 * Starts tagging Bootstrap dialogs portaled to `document.body`, and returns the
 * matching release. Safe to nest: the observer runs while at least one caller
 * holds it. Only `document.body`'s direct children are watched — portals land
 * there, and inline dialogs (already in scope) never do.
 */
export function holdPortaledModalScope(): () => void {
    holders += 1;
    if (!observer) {
        observer = new MutationObserver((records) => {
            for (const record of records) record.addedNodes.forEach(tag);
        });
        observer.observe(document.body, { childList: true });
        // A dialog opened before this ran (or left over from a previous hold).
        document.body.childNodes.forEach(tag);
    }
    let released = false;
    return () => {
        if (released) return;
        released = true;
        holders -= 1;
        if (holders === 0) {
            observer?.disconnect();
            observer = null;
        }
    };
}
