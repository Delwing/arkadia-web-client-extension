import type {Locator, Page} from '@playwright/test';

/**
 * Dialog chrome, addressed without Bootstrap class names.
 *
 * Two kinds of dialog exist in the app:
 *
 * - the ones it owns — the windows in `index.html`, the inline `@web/SubDialog`
 *   and the alias editor that hand-rolls the same shell. Their headers are
 *   real headings and their "x" carries `data-testid="dialog-close"`, because a
 *   bare "x" has neither text nor an accessible name to aim at.
 * - react-bootstrap's own `<Modal>`, which renders `role="dialog"` and a close
 *   button whose accessible name is "Close".
 *
 * Both are covered here so a spec never has to know which one it is looking at.
 */

/** The "x" that dismisses a dialog. */
export function dialogClose(scope: Page | Locator): Locator {
    return scope.locator('[data-testid="dialog-close"]').or(scope.getByRole('button', {name: 'Close'}));
}

/**
 * An inline sub-dialog (`@web/SubDialog`), which renders over whichever window
 * hosts it. With `title`, the one carrying that header.
 */
export function subDialog(scope: Page | Locator, title?: string): Locator {
    const dialogs = scope.getByTestId('sub-dialog');
    if (!title) return dialogs;
    // `has` is matched from the sub-dialog down, so it has to be built from the
    // page: a locator carrying `scope`'s own selector would look for the host
    // window *inside* the dialog and never match.
    const heading = pageOf(scope).getByRole('heading', {name: title, exact: true});
    return dialogs.filter({has: heading});
}

/** The page a scope belongs to - only a Locator carries a `page()`. */
function pageOf(scope: Page | Locator): Page {
    return 'page' in scope ? scope.page() : scope;
}

/** The header of a dialog — the element its title is written in. */
export function dialogTitle(scope: Page | Locator): Locator {
    return scope.getByRole('heading').first();
}
