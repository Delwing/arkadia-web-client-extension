/**
 * Entry for popped-out panels.
 *
 * A popped-out panel opens this page with window.open(); the MAIN client's
 * React tree then portals the panel's content into #popout-root. The page is
 * deliberately empty: it carries no CSS of its own and mirrors the opener's
 * <head> styles and theme attributes instead (see
 * src/shared/dom/mirrorDocumentStyles.ts), so it matches whichever UI opened
 * it - stock or forge - including styles added at runtime (custom theme,
 * fonts, plugins).
 *
 * It must still be a real same-origin page rather than about:blank: cloned
 * <link> stylesheets did not reliably load in an about:blank window. Keep this
 * free of app bootstrap logic and of CSS imports - an imported stylesheet would
 * be applied twice, and in a different cascade position than in the opener.
 */
export {};
