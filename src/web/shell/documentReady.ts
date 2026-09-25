/**
 * Run `fn` once the document is parsed — at once when that already happened.
 *
 * The shells are loaded by the router in `main.ts` through dynamic imports, so
 * their code usually runs after DOMContentLoaded has fired; a plain listener
 * would never be called.
 */
export function whenDocumentReady(fn: () => void): void {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
        fn();
    }
}
