/**
 * The forge shell on the main page.
 *
 * index.html is the stock shell's document: its body is the stock skeleton
 * (output, footer, the page-level windows, the login screen). Forge renders its
 * own skeleton from React and shares ids with the stock one (`#main-container`,
 * `#content-area`, `#map`, …), so the stock markup is taken out before the HUD
 * mounts, leaving only the two tooltip anchors both shells use. What remains is
 * the same document forge-ui/index.html starts from.
 */
import { startForge } from '../../../forge-ui/start';

const FORGE_FONTS =
    'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap';

/** Ids of the body children both shells use; everything else is stock-only. */
const SHARED_BODY_IDS = new Set(['hover-tooltip', 'map-note-tooltip']);

function prepareForgeDocument(): HTMLElement {
    const { body } = document;
    for (const child of Array.from(body.children)) {
        if (child.tagName === 'SCRIPT' || SHARED_BODY_IDS.has(child.id)) continue;
        child.remove();
    }
    // Stock layout switches (map position, phone footer) read by stock CSS only.
    for (const name of Object.keys(body.dataset)) delete body.dataset[name];
    document.documentElement.lang = 'pl';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0a0908');

    const fonts = document.createElement('link');
    fonts.rel = 'stylesheet';
    fonts.href = FORGE_FONTS;
    document.head.appendChild(fonts);

    const root = document.createElement('div');
    root.id = 'root';

    // Offscreen host for the built-in map panel and the object list: the shared
    // panels relocate #map / #objects-list into whichever dock owns them, and
    // EmbeddedMap binds to #map by id, so both must exist before the HUD mounts.
    const offscreen = document.createElement('div');
    offscreen.id = 'fu-offscreen';
    offscreen.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden';
    const map = document.createElement('div');
    map.id = 'map';
    const objectsList = document.createElement('div');
    objectsList.id = 'objects-list';
    offscreen.append(map, objectsList);

    body.prepend(root);
    root.after(offscreen);
    return root;
}

export function startForgeShell(): void {
    startForge(prepareForgeDocument());
}
