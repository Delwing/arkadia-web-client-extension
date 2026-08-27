import type { ReactNode } from 'react';
import {
    BookOpen,
    Library,
    Leaf,
    FileText,
    ScrollText,
    Zap,
    Clock,
    MessageCircle,
    Swords,
    TrendingUp,
    BarChart3,
    PieChart,
    Skull,
    ClipboardList,
    Mail,
    Coins,
    Fish,
    Calendar,
    Wrench,
    Shield,
    PawPrint,
    Dumbbell,
    Caravan,
    type LucideIcon,
} from 'lucide-react';
import eventBus from '@modules/core/eventBus';
import { getContextMenuEntries as getPluginContextMenuEntries } from '@modules/core/pluginUiRegistry';
import { setRenderSettings } from '@modules/core/settings';
import {
    areOutputMessageTypesVisible,
    areOutputTimestampsVisible,
    setOutputMessageTypeVisibility,
    setOutputTimestampVisibility,
} from '@shared/dom/outputMessageHandler';
import { copyOutputAsImage, saveOutputAsHtml } from './copyOutputAsImage';
import { showContextMenu, type ContextMenuEntry } from './contextMenu';

function isLikelyTouchDevice(): boolean {
    return (
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
        navigator.maxTouchPoints > 0
    );
}

function iconLabel(Icon: LucideIcon, text: string): ReactNode {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45em' }}>
            <Icon size={16} />
            {text}
        </span>
    );
}

export interface OutputContextMenuOptions {
    /**
     * Whether the host renders the shared `.output_msg` message wrappers (the
     * `setupOutputMessageHandler` structure with the `.output_msg_content` span
     * and copy/serialise affordances). The copy-as-image / save-as-HTML entries
     * walk that structure, so a host rendering its own plain output (e.g.
     * forge-ui) passes `false` to omit them. Defaults to `true` (the stock UI).
     */
    messageWrappersSupported?: boolean;
    /**
     * Whether to offer the "show/hide timestamps" and "show/hide message types"
     * toggles. These only need each line to carry `.output-timestamp` /
     * `.output-message-type` spans (which forge-ui also emits), so they are
     * decoupled from {@link messageWrappersSupported}. Defaults to `true`.
     */
    messageMetadataToggles?: boolean;
}

export function setupOutputContextMenu(
    outputWrapper: HTMLElement,
    { messageWrappersSupported = true, messageMetadataToggles = true }: OutputContextMenuOptions = {},
): () => void {
    const handler = (event: MouseEvent) => {
        if (event.defaultPrevented) return;
        const isMobileLike = window.innerWidth < 768 || isLikelyTouchDevice();
        if (isMobileLike) return;
        const target = event.target as HTMLElement | null;
        if (target && target.closest('a, [data-output-clickable]')) return;
        event.preventDefault();

        const timestampsVisible = areOutputTimestampsVisible();
        const typesVisible = areOutputMessageTypesVisible();
        const hasSelection = !window.getSelection()?.isCollapsed;

        const items: ContextMenuEntry[] = [];

        if (messageMetadataToggles) {
            items.push(
                {
                    label: timestampsVisible ? 'Ukryj znaczniki czasu' : 'Pokaż znaczniki czasu',
                    action: () => {
                        const next = !timestampsVisible;
                        setOutputTimestampVisibility(next);
                        setRenderSettings({ showTimestamps: next });
                    },
                },
                {
                    label: typesVisible ? 'Ukryj typy wiadomości' : 'Pokaż typy wiadomości',
                    action: () => setOutputMessageTypeVisibility(!typesVisible),
                },
            );
        }

        if (hasSelection && messageWrappersSupported) {
            items.push({
                label: 'Kopiuj jako obraz',
                action: () => {
                    copyOutputAsImage().catch(err => console.error('Failed to copy as image:', err));
                },
            });
            items.push({
                label: 'Zapisz jako HTML',
                action: () => {
                    saveOutputAsHtml().catch(err => console.error('Failed to save as HTML:', err));
                },
            });
        }

        items.push(
            {
                label: iconLabel(BookOpen, 'Wiedza'),
                action: () => eventBus.emit('sendCommand', { command: '/wiedza' }),
                opensWindow: true,
            },
            {
                label: iconLabel(Library, 'Biblioteki'),
                action: () => eventBus.emit('sendCommand', { command: '/biblioteki' }),
                opensWindow: true,
            },
            {
                label: iconLabel(Leaf, 'Zioła'),
                action: () => eventBus.emit('sendCommand', { command: '/ziola' }),
                opensWindow: true,
            },
            {
                label: iconLabel(FileText, 'Zioła (tekst)'),
                action: () => eventBus.emit('sendCommand', { command: '/ziola2' }),
                opensWindow: true,
            },
            {
                label: iconLabel(ScrollText, 'Zlecenia'),
                action: () => eventBus.emit('sendCommand', { command: '/zlecenia' }),
                opensWindow: true,
            },
            {
                label: iconLabel(Caravan, 'Wozy'),
                action: () => eventBus.emit('sendCommand', { command: '/wozw' }),
                opensWindow: true,
            },
            {
                label: iconLabel(Zap, 'Skróty'),
                action: () => eventBus.emit('skroty.popup.open'),
                opensWindow: true,
            },
            {
                label: iconLabel(Clock, 'Zegar'),
                action: () => eventBus.emit('sendCommand', { command: '/czas' }),
                opensWindow: true,
            },
            {
                label: iconLabel(MessageCircle, 'Chat'),
                action: () => eventBus.emit('sendCommand', { command: '/chatw' }),
                opensWindow: true,
            },
            {
                label: iconLabel(Swords, 'Walka'),
                action: () => eventBus.emit('sendCommand', { command: '/walkaw' }),
                opensWindow: true,
            },
            {
                label: iconLabel(PieChart, 'Statystyki'),
                action: () => eventBus.emit('stat.popup.open'),
                opensWindow: true,
            },
            {
                label: iconLabel(TrendingUp, 'Postepy'),
                action: () => eventBus.emit('postepy.popup.open'),
                opensWindow: true,
            },
            {
                label: iconLabel(BarChart3, 'Postepy 2'),
                action: () => eventBus.emit('postepy2.popup.open'),
                opensWindow: true,
            },
            {
                label: iconLabel(Dumbbell, 'Cechy'),
                action: () => eventBus.emit('cechy.popup.open'),
                opensWindow: true,
            },
            {
                label: iconLabel(Skull, 'Zabici'),
                action: () => eventBus.emit('zabici.popup.open'),
                opensWindow: true,
            },
            {
                label: iconLabel(ClipboardList, 'Zabici 2'),
                action: () => eventBus.emit('zabici2.popup.open'),
                opensWindow: true,
            },
            {
                label: iconLabel(Mail, 'Poczta'),
                action: () => eventBus.emit('poczta.popup.open'),
                opensWindow: true,
            },
            {
                label: iconLabel(Coins, 'Depozyty'),
                action: () => eventBus.emit('deposits.popup.open', {}),
                opensWindow: true,
            },
            {
                label: iconLabel(Fish, 'Wedka'),
                action: () => eventBus.emit('sendCommand', { command: '/wedka' }),
                opensWindow: true,
            },
            {
                label: iconLabel(Calendar, 'Kalendarz'),
                action: () => eventBus.emit('sunTracker.popup.open'),
                opensWindow: true,
            },
            {
                label: iconLabel(Wrench, 'Zawod'),
                action: () => eventBus.emit('profession.popup.open'),
                opensWindow: true,
            },
            {
                label: iconLabel(Shield, 'Zlom'),
                action: () => eventBus.emit('zlom.popup.open'),
                opensWindow: true,
            },
            {
                label: iconLabel(PawPrint, 'Oswajanie'),
                action: () => eventBus.emit('oswajanie.popup.open', {}),
                opensWindow: true,
            },
        );

        for (const entry of getPluginContextMenuEntries()) {
            items.push(entry);
        }

        showContextMenu(items, event.clientX, event.clientY, { columns: 2 });
    };

    outputWrapper.addEventListener('contextmenu', handler);
    return () => outputWrapper.removeEventListener('contextmenu', handler);
}
