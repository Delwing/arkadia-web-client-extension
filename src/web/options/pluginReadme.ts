import { Marked } from "marked";

/**
 * Renders a catalogue README to HTML.
 *
 * The text comes from whoever published the plugin, so it is untrusted: it is
 * parsed with its own `Marked` instance (never the shared `marked` singleton the
 * bundled docs configure) and the result is then run through an allowlist
 * sanitizer below. Installing a plugin means running its code, so this is not
 * the security boundary that matters — but *reading about* a plugin you decided
 * against should not be able to do anything at all.
 */
const parser = new Marked({ gfm: true, breaks: false });

/** Tags kept as-is. Everything structural a README needs, nothing that acts. */
const ALLOWED_TAGS = new Set([
    "A", "B", "BLOCKQUOTE", "BR", "CODE", "DEL", "DIV", "EM", "H1", "H2", "H3", "H4", "H5", "H6",
    "HR", "I", "IMG", "LI", "OL", "P", "PRE", "S", "SPAN", "STRONG", "TABLE", "TBODY", "TD",
    "TFOOT", "TH", "THEAD", "TR", "UL",
]);

/** Tags dropped with their contents — nothing inside them is worth keeping. */
const DROPPED_TAGS = new Set([
    "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "FORM", "INPUT", "BUTTON",
    "TEXTAREA", "SELECT", "SVG", "MATH", "BASE", "TEMPLATE", "NOSCRIPT",
]);

const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
    A: new Set(["href", "title"]),
    IMG: new Set(["src", "alt", "title"]),
};

function isSafeUrl(value: string, schemes: string[]): boolean {
    try {
        // A relative URL in a README has no meaningful base in the client, so it
        // resolves against the page and is judged by the scheme it lands on.
        return schemes.includes(new URL(value, window.location.href).protocol);
    } catch {
        return false;
    }
}

function sanitize(root: ParentNode): void {
    for (const element of [...root.querySelectorAll("*")]) {
        if (DROPPED_TAGS.has(element.tagName)) {
            element.remove();
            continue;
        }

        if (!ALLOWED_TAGS.has(element.tagName)) {
            // Unknown but harmless wrapper: keep the text, lose the element.
            element.replaceWith(...element.childNodes);
            continue;
        }

        const allowed = ALLOWED_ATTRIBUTES[element.tagName] ?? new Set<string>();
        for (const attribute of [...element.attributes]) {
            if (!allowed.has(attribute.name)) {
                element.removeAttribute(attribute.name);
                continue;
            }
            const schemes = attribute.name === "href" ? ["http:", "https:", "mailto:"] : ["http:", "https:"];
            if (
                (attribute.name === "href" || attribute.name === "src") &&
                !isSafeUrl(attribute.value, schemes)
            ) {
                element.removeAttribute(attribute.name);
            }
        }

        if (element.tagName === "A") {
            element.setAttribute("target", "_blank");
            element.setAttribute("rel", "noopener noreferrer");
        }
    }
}

export function renderPluginReadme(markdown: string): string {
    if (!markdown?.trim()) return "";
    const template = document.createElement("template");
    template.innerHTML = parser.parse(markdown, { async: false }) as string;
    sanitize(template.content);
    return template.innerHTML;
}
