export interface TooltipEntry {
    /** Left-hand grey caption; empty draws none. */
    label: string;
    content: string | Node;
    /** Extra class on the row, e.g. `hover-tooltip__entry--hint` for a click/hold hint. */
    className?: string;
}

/** A label/content row, or a ready-made node laid out full width (a chart, a bar). */
export type TooltipPart = TooltipEntry | Node;

let tooltipElement: HTMLElement | null = null;
let initialized = false;
/** The control a showTooltipFor tooltip belongs to; pressing it keeps the tooltip up. */
let anchorElement: Element | null = null;

function ensureTooltip(): HTMLElement | null {
    if (!tooltipElement) {
        tooltipElement = document.getElementById('hover-tooltip') as HTMLElement | null;
    }
    if (!initialized) {
        initialized = true;
        document.addEventListener('pointerdown', (e) => {
            if (anchorElement && e.target instanceof Node && anchorElement.contains(e.target)) return;
            hideTooltip();
        });
    }
    return tooltipElement;
}

export function hideTooltip(): void {
    const el = ensureTooltip();
    if (!el) return;
    anchorElement = null;
    el.classList.remove('show');
    el.innerHTML = '';
    el.style.visibility = '';
}

function isNode(part: TooltipPart): part is Node {
    return typeof (part as Node).nodeType === 'number';
}

function fill(el: HTMLElement, parts: TooltipPart[], header?: string): void {
    if (header) {
        const headerEl = document.createElement('div');
        headerEl.className = 'hover-tooltip__header';
        headerEl.textContent = header;
        el.appendChild(headerEl);
    }

    for (const part of parts) {
        if (isNode(part)) {
            el.appendChild(part);
            continue;
        }
        const wrapper = document.createElement('div');
        wrapper.className = part.className ? `hover-tooltip__entry ${part.className}` : 'hover-tooltip__entry';

        if (part.label) {
            const labelEl = document.createElement('span');
            labelEl.className = 'hover-tooltip__label';
            labelEl.textContent = part.label;
            wrapper.appendChild(labelEl);
        }

        const contentEl = document.createElement('span');
        contentEl.className = 'hover-tooltip__content';
        if (typeof part.content === 'string') {
            contentEl.textContent = part.content;
        } else {
            contentEl.appendChild(part.content);
        }
        wrapper.appendChild(contentEl);

        el.appendChild(wrapper);
    }
}

/** Measures the filled tooltip hidden, then shows it where `place` puts it. */
function reveal(
    el: HTMLElement,
    place: (rect: DOMRect, viewportWidth: number, viewportHeight: number) => { left: number; top: number },
): void {
    el.style.left = '0px';
    el.style.top = '0px';
    el.style.visibility = 'hidden';
    el.classList.add('show');

    const rect = el.getBoundingClientRect();
    const viewportWidth = document.documentElement?.clientWidth ?? window.innerWidth ?? 0;
    const viewportHeight = document.documentElement?.clientHeight ?? window.innerHeight ?? 0;
    const { left, top } = place(rect, viewportWidth, viewportHeight);

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = '';
}

export function showTooltip(
    entries: TooltipEntry[],
    x: number,
    y: number,
    header?: string,
): void {
    const el = ensureTooltip();
    if (!el) return;

    hideTooltip();

    if (entries.length === 0) return;

    fill(el, entries, header);
    reveal(el, (rect, viewportWidth, viewportHeight) => {
        let left = x;
        let top = y + 16;
        if (left + rect.width > viewportWidth) {
            left = Math.max(0, viewportWidth - rect.width);
        }
        if (top + rect.height > viewportHeight) {
            top = Math.max(0, y - rect.height - 4);
        }
        return { left, top };
    });
}

/**
 * Shows the tooltip for a hovered control: above it, or beneath it when there is
 * no room above. A press on the control itself leaves it up; one anywhere else
 * puts it away, as with the other tooltips. False when this document has no
 * #hover-tooltip to draw into (a popout window, a unit test), so the caller can
 * fall back to a native title.
 */
export function showTooltipFor(anchor: Element, parts: TooltipPart[], header?: string): boolean {
    if (anchor.ownerDocument !== document) return false;
    const el = ensureTooltip();
    if (!el) return false;

    hideTooltip();

    if (parts.length === 0 && !header) return true;

    anchorElement = anchor;
    fill(el, parts, header);
    const box = anchor.getBoundingClientRect();
    reveal(el, (rect, viewportWidth, viewportHeight) => {
        const gap = 6;
        let top = box.top - rect.height - gap;
        if (top < 0) top = Math.min(box.bottom + gap, Math.max(0, viewportHeight - rect.height));
        const left = Math.max(0, Math.min(box.left, viewportWidth - rect.width));
        return { left, top };
    });
    return true;
}

/**
 * A control's hover card: a header, label/content rows (or whole nodes, laid out
 * full width), and at the foot what a click and a long press do. A plain string
 * is one line.
 */
export interface TooltipCard {
    header?: string;
    rows?: TooltipPart[];
    click?: string;
    hold?: string;
}

export type TooltipContent = string | TooltipCard;

export function cardParts(card: TooltipContent): { header?: string; parts: TooltipPart[] } {
    if (typeof card === 'string') return { parts: [{ label: '', content: card }] };
    const parts: TooltipPart[] = [...(card.rows ?? [])];
    const hint = 'hover-tooltip__entry--hint';
    if (card.click) parts.push({ label: 'kliknij', content: card.click, className: hint });
    if (card.hold) parts.push({ label: 'przytrzymaj', content: card.hold, className: hint });
    return { header: card.header, parts };
}

/** The card as plain lines, for the native title fallback. */
export function cardText(card: TooltipContent): string {
    const { header, parts } = cardParts(card);
    const lines = parts.map((part) => isNode(part)
        ? part.textContent ?? ''
        : [part.label, typeof part.content === 'string' ? part.content : part.content.textContent].filter(Boolean).join(': '));
    return [header, ...lines].filter(Boolean).join('\n');
}

/** Shows `card` over `anchor`, or puts it in a native title where there is no hover tooltip. */
export function showCardFor(anchor: Element, card: TooltipContent): void {
    const { header, parts } = cardParts(card);
    if (!showTooltipFor(anchor, parts, header)) anchor.setAttribute('title', cardText(card));
}

/** Hides the hover tooltip if it is the one shown for `anchor`. */
export function hideTooltipFor(anchor: Element): void {
    if (anchorElement === anchor) hideTooltip();
}

export interface TooltipHandle {
    /** Replaces the card; redrawn at once while the element is hovered. Null shows none. */
    update(card: TooltipContent | null): void;
    /** Detaches the tooltip from the element. */
    remove(): void;
}

/**
 * Gives a plain DOM element a hover card - the imperative twin of Chip's `tip`,
 * for content that is not one of our React chips (plugin footer components).
 * Mouse and pen only: a touch press would show and dismiss it in one go.
 */
export function attachTooltip(anchor: Element, card: TooltipContent | null): TooltipHandle {
    let current = card;
    let hovered = false;
    const show = () => {
        if (current) showCardFor(anchor, current);
        else hideTooltipFor(anchor);
    };
    const enter = (e: Event) => {
        if ((e as PointerEvent).pointerType === 'touch') return;
        hovered = true;
        show();
    };
    const leave = () => {
        hovered = false;
        hideTooltipFor(anchor);
    };
    anchor.addEventListener('pointerenter', enter);
    anchor.addEventListener('pointerleave', leave);
    return {
        update(next) {
            current = next;
            if (hovered) show();
        },
        remove() {
            anchor.removeEventListener('pointerenter', enter);
            anchor.removeEventListener('pointerleave', leave);
            leave();
        },
    };
}
