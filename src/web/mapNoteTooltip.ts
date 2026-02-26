import { getNote } from '@web/options/locationNotesStorage';
import { getPluginLocationNotes } from '@modules/core/pluginLocationNotesRegistry';

let tooltipElement: HTMLElement | null = null;
let initialized = false;

function ensureTooltip(): HTMLElement | null {
    if (!tooltipElement) {
        tooltipElement = document.getElementById('map-note-tooltip') as HTMLElement | null;
    }
    if (!initialized) {
        initialized = true;
        document.addEventListener('pointerdown', hideMapNoteTooltip);
    }
    return tooltipElement;
}

export function hideMapNoteTooltip(): void {
    const el = ensureTooltip();
    if (!el) return;
    el.classList.remove('show');
    el.innerHTML = '';
    el.style.visibility = '';
}

function showTooltipAt(el: HTMLElement, x: number, y: number): void {
    el.style.left = '0px';
    el.style.top = '0px';
    el.style.visibility = 'hidden';
    el.classList.add('show');

    const rect = el.getBoundingClientRect();
    const viewportWidth = document.documentElement?.clientWidth ?? window.innerWidth ?? 0;
    const viewportHeight = document.documentElement?.clientHeight ?? window.innerHeight ?? 0;

    let left = x;
    let top = y;

    if (left + rect.width > viewportWidth) {
        left = Math.max(0, viewportWidth - rect.width);
    }
    if (top + rect.height > viewportHeight) {
        top = Math.max(0, viewportHeight - rect.height);
    }

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = '';
}

function appendNote(container: HTMLElement, label: string, text: string): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'map-note-tooltip__entry';

    const labelEl = document.createElement('span');
    labelEl.className = 'map-note-tooltip__label';
    labelEl.textContent = label;
    wrapper.appendChild(labelEl);

    const textEl = document.createElement('span');
    textEl.className = 'map-note-tooltip__text';
    textEl.textContent = text;
    wrapper.appendChild(textEl);

    container.appendChild(wrapper);
}

export async function showMapNoteTooltipForRoom(
    roomId: number,
    x: number,
    y: number,
    mapNote: string | undefined,
): Promise<void> {
    const el = ensureTooltip();
    if (!el) return;

    hideMapNoteTooltip();

    const [userNote, pluginNotes] = await Promise.all([
        getNote(roomId).catch(() => null),
        Promise.resolve(getPluginLocationNotes(roomId)),
    ]);

    const hasAny = mapNote || userNote?.note || pluginNotes.length > 0;
    if (!hasAny) return;

    if (userNote?.note) {
        appendNote(el, 'Notatka:', userNote.note);
    }
    for (const pn of pluginNotes) {
        appendNote(el, `${pn.pluginName}:`, pn.note);
    }
    if (mapNote) {
        appendNote(el, 'Mapa:', mapNote);
    }

    showTooltipAt(el, x, y);
}
