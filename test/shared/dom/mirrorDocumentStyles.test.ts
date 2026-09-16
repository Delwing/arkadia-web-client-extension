import { mirrorDocumentStyles, type DocumentStyleMirror } from '@shared/dom/mirrorDocumentStyles';

// MutationObserver callbacks run as microtasks.
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function mirroredStyles(target: Document): string[] {
    return Array.from(target.head.querySelectorAll('style')).map(style => style.textContent ?? '');
}

describe('mirrorDocumentStyles', () => {
    let target: Document;
    let mirror: DocumentStyleMirror | null;

    beforeEach(() => {
        document.head.innerHTML = '';
        document.documentElement.className = '';
        document.body.className = '';
        for (const attr of Array.from(document.body.attributes)) document.body.removeAttribute(attr.name);
        target = document.implementation.createHTMLDocument('popout');
        target.head.innerHTML = '<meta charset="utf-8"><style>html, body { background: #1a1a1a; }</style>';
        mirror = null;
    });

    afterEach(() => {
        mirror?.dispose();
    });

    it('copies style and stylesheet link nodes after the popout page\'s own head', () => {
        document.head.innerHTML = `
            <link rel="icon" href="/favicon.png">
            <style>.a { color: red; }</style>
            <link rel="stylesheet" href="assets/app.css">`;

        mirror = mirrorDocumentStyles(document, target);

        expect(mirroredStyles(target)).toEqual(['html, body { background: #1a1a1a; }', '.a { color: red; }']);
        const links = target.head.querySelectorAll('link');
        expect(links).toHaveLength(1);
        // Resolved against the opener, not left relative to the popout page.
        expect(links[0].getAttribute('href')).toBe(new URL('assets/app.css', document.baseURI).href);
    });

    it('follows styles added, edited and removed in the opener', async () => {
        document.head.innerHTML = '<style id="first">.a {}</style>';
        mirror = mirrorDocumentStyles(document, target);

        const added = document.createElement('style');
        added.textContent = '.plugin {}';
        document.head.appendChild(added);
        await flush();
        expect(mirroredStyles(target)).toContain('.plugin {}');

        // Vite HMR and theme switches rewrite a tag in place.
        added.textContent = '.plugin { color: blue; }';
        await flush();
        expect(mirroredStyles(target)).toContain('.plugin { color: blue; }');
        expect(mirroredStyles(target)).not.toContain('.plugin {}');

        added.remove();
        await flush();
        expect(mirroredStyles(target)).not.toContain('.plugin { color: blue; }');
    });

    it('keeps the opener\'s cascade order when a style is inserted between others', async () => {
        document.head.innerHTML = '<style>.first {}</style><style id="last">.last {}</style>';
        mirror = mirrorDocumentStyles(document, target);

        const middle = document.createElement('style');
        middle.textContent = '.middle {}';
        document.head.insertBefore(middle, document.getElementById('last'));
        await flush();

        expect(mirroredStyles(target).slice(1)).toEqual(['.first {}', '.middle {}', '.last {}']);
    });

    it('mirrors theme classes and data attributes, and follows changes', async () => {
        document.documentElement.className = 'theme-root';
        document.body.className = 'theme-fantasy';
        document.body.setAttribute('data-theme', 'fantasy');
        mirror = mirrorDocumentStyles(document, target);

        expect(target.documentElement.className).toBe('theme-root');
        expect(target.body.className).toBe('theme-fantasy');
        expect(target.body.getAttribute('data-theme')).toBe('fantasy');

        document.body.className = 'theme-icy';
        document.body.removeAttribute('data-theme');
        await flush();

        expect(target.body.className).toBe('theme-icy');
        expect(target.body.hasAttribute('data-theme')).toBe(false);
    });

    it('resolves ready once mirrored stylesheet links have loaded', async () => {
        document.head.innerHTML = '<link rel="stylesheet" href="a.css"><link rel="stylesheet" href="b.css">';
        mirror = mirrorDocumentStyles(document, target);

        let resolved = false;
        void mirror.ready.then(() => { resolved = true; });
        const [a, b] = Array.from(target.head.querySelectorAll('link'));

        a.dispatchEvent(new Event('load'));
        await flush();
        expect(resolved).toBe(false);

        b.dispatchEvent(new Event('error'));
        await flush();
        expect(resolved).toBe(true);
    });

    it('stops syncing and removes its nodes on dispose', async () => {
        document.head.innerHTML = '<style>.a {}</style>';
        mirror = mirrorDocumentStyles(document, target);
        mirror.dispose();

        expect(mirroredStyles(target)).toEqual(['html, body { background: #1a1a1a; }']);
        const late = document.createElement('style');
        late.textContent = '.late {}';
        document.head.appendChild(late);
        await flush();
        expect(mirroredStyles(target)).not.toContain('.late {}');
    });
});
