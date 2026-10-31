/**
 * Map hints: rooms where an entry is learned are highlighted, with a location note
 * saying which entry and how to get it. Switched from the details window.
 */
import {globalStorage} from '@modules/core/storage';
import {KNOWLEDGE_DETAILS_TYPES} from '@modules/data/dataStores/knowledgeDetailsStore';
import {removeAllPluginNotes, setPluginLocationNote} from '@modules/core/pluginLocationNotesRegistry';
import {KNOWLEDGE_CATEGORY_ORDER} from '../../knowledgeCategories';
import type {KnowledgeContext} from './context';
import {KNOWLEDGE_ENTRY_LOCATIONS, normalizeKnowledgeEntry} from './parsing';

const KNOWLEDGE_HINTS_PLUGIN_ID = '__knowledge_hints__';
const KNOWLEDGE_HINTS_PLUGIN_NAME = 'Wiedza';

export interface KnowledgeHints {
    /** Redraws the hints, if they are on, after the character's known entries changed. */
    refresh(): void;
}

export function createKnowledgeHints(ctx: KnowledgeContext): KnowledgeHints {
    const {client} = ctx;
    let highlighter: ReturnType<typeof client.Map.createHighlighter> | null = null;
    let enabled = false;
    let hideCompleted = false;

    function buildKnownEntriesSet(): Set<string> {
        const known = new Set<string>();
        const characterProgress = ctx.details?.data.progress[ctx.characterKey()];
        if (!characterProgress) return known;
        for (const category of KNOWLEDGE_CATEGORY_ORDER) {
            const progress = characterProgress[category];
            if (!progress?.entries) continue;
            for (const type of KNOWLEDGE_DETAILS_TYPES) {
                const entries = progress.entries[type];
                if (!Array.isArray(entries)) continue;
                for (const entry of entries) {
                    if (typeof entry === 'string') {
                        known.add(normalizeKnowledgeEntry(entry));
                    }
                }
            }
        }
        return known;
    }

    function clear() {
        if (highlighter) {
            highlighter.destroy();
            highlighter = null;
        }
        removeAllPluginNotes(KNOWLEDGE_HINTS_PLUGIN_ID);
    }

    function enable(hide: boolean) {
        clear();
        enabled = true;
        hideCompleted = hide;
        highlighter = client.Map.createHighlighter({color: '#FF9F43'});

        const knownEntries = buildKnownEntriesSet();
        const roomIds: number[] = [];
        const notesByRoom = new Map<number, string[]>();
        for (const entry of KNOWLEDGE_ENTRY_LOCATIONS) {
            if (entry.id == null) continue;
            const isKnown = knownEntries.has(normalizeKnowledgeEntry(entry.Wiedza));
            if (isKnown && hide) continue;
            roomIds.push(entry.id);
            const parts: string[] = [];
            if (entry.lokalizacja) parts.push(entry.lokalizacja);
            if (entry.note) parts.push(entry.note);
            if (parts.length > 0) {
                const prefix = isKnown ? '✓ ' : '';
                const line = `${prefix}[${entry.Rodzaj}] ${entry.Wiedza}\n${parts.join(' — ')}`;
                const existing = notesByRoom.get(entry.id);
                if (existing) {
                    existing.push(line);
                } else {
                    notesByRoom.set(entry.id, [line]);
                }
            }
        }
        for (const [roomId, lines] of notesByRoom) {
            setPluginLocationNote(
                KNOWLEDGE_HINTS_PLUGIN_ID,
                KNOWLEDGE_HINTS_PLUGIN_NAME,
                roomId,
                lines.join('\n\n'),
                {builtin: true},
            );
        }
        highlighter.add(roomIds);
    }

    function disable() {
        enabled = false;
        hideCompleted = false;
        clear();
    }

    function readPersistedSettings(): { showHints: boolean; hideCompleted: boolean } {
        try {
            const settings = globalStorage.get('layoutManagerState')?.popupPanels?.['popup:knowledgeDetails']?.settings;
            return {
                showHints: settings?.showHints === true,
                hideCompleted: settings?.hideCompleted === true,
            };
        } catch {
            return {showHints: false, hideCompleted: false};
        }
    }

    client.on('knowledgeHints', (detail) => {
        const payload = detail as { enabled: boolean; hideCompleted: boolean } | undefined;
        if (payload?.enabled) {
            enable(payload.hideCompleted);
        } else {
            disable();
        }
    });

    const persisted = readPersistedSettings();
    if (persisted.showHints) {
        enable(persisted.hideCompleted);
    }

    return {
        refresh() {
            if (enabled) {
                enable(hideCompleted);
            }
        },
    };
}
