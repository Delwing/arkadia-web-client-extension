import type {Page} from '@playwright/test';

/**
 * Resolves a colour value the way the browser does, in the form `toHaveCSS`
 * compares against — `rgb()` or `rgba()`.
 *
 * Why: footer and popup colours now come from the token layer
 * (src/web/themes/bridge.css → src/ui/design/css/tokens.css) and change with the
 * theme. A test pinned to one literal shade is asserting the wrong thing — what
 * matters is that the element takes the right role, not that it has a given hex.
 *
 * The probe is appended to <body>, i.e. inside `.ark-root`, which is exactly
 * where the elements under test live.
 */
export async function resolveColor(page: Page, value: string): Promise<string> {
    return page.evaluate((input) => {
        const probe = document.createElement('span');
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.color = input;
        document.body.appendChild(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return resolved;
    }, value);
}
