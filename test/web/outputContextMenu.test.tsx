import { afterEach, describe, expect, test } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Puzzle } from 'lucide-react';
import { registerContextMenuEntry, unregisterContextMenuEntry } from '@modules/core/pluginUiRegistry';
import { buildOutputContextMenuItems } from '@web/outputContextMenu.tsx';

/** The output's right-click menu: plugin entries under Wtyczki. */

const ids: string[] = [];

function addPluginEntry(id: string, label: string | Node): void {
    ids.push(id);
    registerContextMenuEntry(id, label, () => {});
}

function pluginItems() {
    return buildOutputContextMenuItems('', { messageMetadataToggles: false }).filter((item) => item.section === 'Wtyczki');
}

function draw(node: React.ReactNode): HTMLElement {
    const host = document.createElement('div');
    act(() => createRoot(host).render(<>{node}</>));
    return host;
}

afterEach(() => {
    ids.splice(0).forEach(unregisterContextMenuEntry);
});

describe('buildOutputContextMenuItems: plugin entries', () => {
    test('a plain label gets the puzzle', () => {
        addPluginEntry('plain', 'Notatnik');
        const [item] = pluginItems();
        expect(item.icon).toBe(Puzzle);
        expect(item.label).toBe('Notatnik');
    });

    test('a label opening with its own icon gives it to the icon column', () => {
        const label = document.createElement('span');
        label.innerHTML = '<span style="margin-right: 4px"><svg></svg></span> Czat';
        addPluginEntry('svg', label);
        addPluginEntry('emoji', '⛭ Zegar');
        const [svg, emoji] = pluginItems();

        expect(svg.icon).not.toBe(Puzzle);
        const Icon = svg.icon!;
        expect(draw(<Icon size={15} />).querySelector('.plugin-own-icon svg')).not.toBeNull();
        expect((svg.label as Node).textContent).toBe('Czat');
        expect((svg.label as Element).querySelector('svg')).toBeNull();
        expect(label.querySelector('svg'), 'the plugin keeps its own node').not.toBeNull();

        const EmojiIcon = emoji.icon!;
        expect(draw(<EmojiIcon size={15} />).textContent).toBe('⛭');
        expect(emoji.label).toBe('Zegar');
    });
});
