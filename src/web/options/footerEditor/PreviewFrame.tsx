import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Mirrors the page's stylesheets, and the attributes they key on, into the frame. */
function mirrorPage(target: Document): () => void {
    const base = target.createElement("base");
    base.href = document.baseURI;
    target.head.appendChild(base);

    const copy = (node: Node) => {
        if (node instanceof HTMLStyleElement || (node instanceof HTMLLinkElement && node.rel === "stylesheet")) {
            target.head.appendChild(target.importNode(node, true));
        }
    };
    document.head.childNodes.forEach(copy);
    // Vite adds stylesheets as modules load (a lazy chunk, a dev update).
    const added = new MutationObserver((mutations) => mutations.forEach((m) => m.addedNodes.forEach(copy)));
    added.observe(document.head, { childList: true });

    // Themes and footer settings ride on <html> and <body> attributes and inline variables.
    const syncAttributes = () => {
        for (const [from, to] of [[document.documentElement, target.documentElement], [document.body, target.body]] as const) {
            for (const attr of Array.from(to.attributes)) {
                if (!from.hasAttribute(attr.name)) to.removeAttribute(attr.name);
            }
            for (const attr of Array.from(from.attributes)) to.setAttribute(attr.name, attr.value);
        }
        target.body.classList.add("footer-preview-body");
    };
    syncAttributes();
    const attributes = new MutationObserver(syncAttributes);
    attributes.observe(document.documentElement, { attributes: true });
    attributes.observe(document.body, { attributes: true });

    return () => {
        added.disconnect();
        attributes.disconnect();
    };
}

/**
 * A same-origin frame showing `children` with the page's own stylesheets: the
 * footer drawn in it keeps its ids and the stylesheet's id selectors, without
 * clashing with the real footer's, and nothing in it can be reached from the
 * page by mistake. As tall as its content. Portaled from the page's own React
 * tree, so what is drawn in it has the contexts the UI provides.
 */
export default function PreviewFrame({ children, title }: { children: ReactNode; title: string }) {
    const frameRef = useRef<HTMLIFrameElement>(null);
    const [host, setHost] = useState<HTMLElement | null>(null);

    useEffect(() => {
        const frame = frameRef.current;
        const doc = frame?.contentDocument;
        if (!frame || !doc) return;
        doc.open();
        doc.write("<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>");
        doc.close();
        const stopMirroring = mirrorPage(doc);
        const host = doc.createElement("div");
        host.className = "footer-preview-host";
        doc.body.appendChild(host);

        const fit = () => {
            frame.style.height = `${Math.ceil(host.getBoundingClientRect().height)}px`;
        };
        const resize = new ResizeObserver(fit);
        resize.observe(host);
        setHost(host);

        return () => {
            resize.disconnect();
            stopMirroring();
            setHost(null);
        };
    }, []);

    return (
        <>
            <iframe ref={frameRef} className="footer-editor__frame" title={title} />
            {host && createPortal(children, host)}
        </>
    );
}
