export interface TooltipEntry {
    label: string;
    content: string | Node;
}

let tooltipElement: HTMLElement | null = null;
let initialized = false;

function ensureTooltip(): HTMLElement | null {
    if (!tooltipElement) {
        tooltipElement = document.getElementById('hover-tooltip') as HTMLElement | null;
    }
    if (!initialized) {
        initialized = true;
        document.addEventListener('pointerdown', hideTooltip);
    }
    return tooltipElement;
}

export function hideTooltip(): void {
    const el = ensureTooltip();
    if (!el) return;
    el.classList.remove('show');
    el.innerHTML = '';
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

    if (header) {
        const headerEl = document.createElement('div');
        headerEl.className = 'hover-tooltip__header';
        headerEl.textContent = header;
        el.appendChild(headerEl);
    }

    for (const entry of entries) {
        const wrapper = document.createElement('div');
        wrapper.className = 'hover-tooltip__entry';

        const labelEl = document.createElement('span');
        labelEl.className = 'hover-tooltip__label';
        labelEl.textContent = entry.label;
        wrapper.appendChild(labelEl);

        const contentEl = document.createElement('span');
        contentEl.className = 'hover-tooltip__content';
        if (typeof entry.content === 'string') {
            contentEl.textContent = entry.content;
        } else {
            contentEl.appendChild(entry.content);
        }
        wrapper.appendChild(contentEl);

        el.appendChild(wrapper);
    }

    el.style.left = '0px';
    el.style.top = '0px';
    el.style.visibility = 'hidden';
    el.classList.add('show');

    const rect = el.getBoundingClientRect();
    const viewportWidth = document.documentElement?.clientWidth ?? window.innerWidth ?? 0;
    const viewportHeight = document.documentElement?.clientHeight ?? window.innerHeight ?? 0;

    let left = x;
    let top = y + 16;

    if (left + rect.width > viewportWidth) {
        left = Math.max(0, viewportWidth - rect.width);
    }
    if (top + rect.height > viewportHeight) {
        top = Math.max(0, y - rect.height - 4);
    }

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = '';
}
