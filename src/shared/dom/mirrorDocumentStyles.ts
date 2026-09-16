/**
 * Keeps a popout window's styling identical to the main window's.
 *
 * A popped-out panel lives in a separate document, so it sees none of the
 * opener's CSS. Rather than import a hand-kept copy of the stylesheet bundle
 * (which misses anything added at runtime: custom themes, fonts, plugin styles,
 * a different UI entry's CSS), the popout mirrors the opener's `<head>` style
 * nodes and theme attributes, and keeps them in sync while it is open.
 *
 * The target must be a real same-origin page, not about:blank - cloned
 * `<link>` stylesheets did not reliably load in an about:blank window.
 *
 * Nodes are matched by `nodeName`, never `instanceof`: the two documents
 * belong to different JS realms.
 */

/** How long `ready` waits for mirrored `<link>` stylesheets before giving up. */
const LINK_LOAD_TIMEOUT_MS = 2000;

export interface DocumentStyleMirror {
    /** Resolves once the initially mirrored stylesheets have loaded (or failed, or timed out). */
    ready: Promise<void>;
    /** Stops syncing and removes every mirrored node. Safe to call twice. */
    dispose(): void;
}

type StyleSource = HTMLStyleElement | HTMLLinkElement;

function isStyleSource(node: Node): node is StyleSource {
    if (node.nodeName === 'STYLE') return true;
    return node.nodeName === 'LINK' && /(^|\s)stylesheet(\s|$)/i.test((node as HTMLLinkElement).rel);
}

function closestStyleSource(node: Node | null, head: HTMLElement): StyleSource | null {
    for (let current = node; current && current !== head; current = current.parentNode) {
        if (isStyleSource(current)) return current;
    }
    return null;
}

/** Copies `<html>` / `<body>` classes and `<body>` data-* attributes, which select the theme. */
export function mirrorThemeAttributes(source: Document, target: Document): void {
    target.documentElement.className = source.documentElement.className;
    target.body.className = source.body.className;
    for (const attr of Array.from(target.body.attributes)) {
        if (attr.name.startsWith('data-') && !source.body.hasAttribute(attr.name)) {
            target.body.removeAttribute(attr.name);
        }
    }
    for (const attr of Array.from(source.body.attributes)) {
        if (attr.name.startsWith('data-')) target.body.setAttribute(attr.name, attr.value);
    }
}

export function mirrorDocumentStyles(source: Document, target: Document): DocumentStyleMirror {
    const clones = new Map<StyleSource, Element>();
    const view = source.defaultView ?? window;

    const cloneOf = (node: StyleSource): Element => {
        const clone = target.importNode(node, true);
        // A relative href would resolve against the popout page's URL, not the opener's.
        if (node.nodeName === 'LINK') (clone as HTMLLinkElement).href = (node as HTMLLinkElement).href;
        return clone;
    };

    /** Insert before the clone of the next mirrored sibling, so cascade order matches the opener. */
    const insert = (node: StyleSource, clone: Element): void => {
        for (let next = node.nextSibling; next; next = next.nextSibling) {
            const anchor = isStyleSource(next) ? clones.get(next) : undefined;
            if (anchor?.parentNode === target.head) {
                target.head.insertBefore(clone, anchor);
                return;
            }
        }
        target.head.appendChild(clone);
    };

    const add = (node: StyleSource): Element => {
        const clone = cloneOf(node);
        clones.set(node, clone);
        insert(node, clone);
        return clone;
    };

    const remove = (node: Node): void => {
        const clone = clones.get(node as StyleSource);
        if (!clone) return;
        clone.remove();
        clones.delete(node as StyleSource);
    };

    const replace = (node: StyleSource): void => {
        remove(node);
        add(node);
    };

    const initialLinks: Element[] = [];
    for (const node of Array.from(source.head.childNodes)) {
        if (!isStyleSource(node)) continue;
        const clone = add(node);
        if (node.nodeName === 'LINK') initialLinks.push(clone);
    }
    mirrorThemeAttributes(source, target);

    const headObserver = new view.MutationObserver((records) => {
        for (const record of records) {
            if (record.type === 'childList' && record.target === source.head) {
                record.removedNodes.forEach(remove);
                record.addedNodes.forEach((node) => {
                    if (isStyleSource(node) && !clones.has(node)) add(node);
                });
                continue;
            }
            if (record.type === 'attributes' && record.target.parentNode === source.head) {
                const node = record.target;
                if (isStyleSource(node)) replace(node);
                else remove(node);
                continue;
            }
            // Text edits inside a <style> (Vite HMR rewrites the tag in place).
            const owner = closestStyleSource(record.target, source.head);
            const clone = owner ? clones.get(owner) : undefined;
            if (owner && clone) clone.textContent = owner.textContent;
        }
    });
    headObserver.observe(source.head, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['href', 'rel', 'media', 'disabled'],
    });

    const themeObserver = new view.MutationObserver(() => mirrorThemeAttributes(source, target));
    themeObserver.observe(source.documentElement, { attributes: true, attributeFilter: ['class'] });
    themeObserver.observe(source.body, { attributes: true });

    let timeout = 0;
    const ready = new Promise<void>((resolve) => {
        let pending = initialLinks.length;
        if (pending === 0) {
            resolve();
            return;
        }
        const settle = () => {
            pending -= 1;
            if (pending === 0) resolve();
        };
        for (const link of initialLinks) {
            link.addEventListener('load', settle, { once: true });
            link.addEventListener('error', settle, { once: true });
        }
        timeout = view.setTimeout(resolve, LINK_LOAD_TIMEOUT_MS);
    });

    let disposed = false;
    return {
        ready,
        dispose: () => {
            if (disposed) return;
            disposed = true;
            headObserver.disconnect();
            themeObserver.disconnect();
            view.clearTimeout(timeout);
            clones.forEach((clone) => clone.remove());
            clones.clear();
        },
    };
}
