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
    ShieldHalf,
    PawPrint,
    Dumbbell,
    Caravan,
    Copy,
    Image,
    FileCode,
    Search,
    Puzzle,
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
import { isMobileLikeViewport } from '@shared/dom/pointerEnvironment.ts';
import { hasPopup } from './layout/popupRegistry';
import { canSearchLogs, requestLogSearch } from './logSearchRequest';
import { showContextMenu, type ContextMenuEntry, type ContextMenuIcon } from './contextMenu';

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

interface WindowLauncher {
    label: string;
    icon: ContextMenuIcon;
    /** The popup's registry id: registered means open (a dot on the tile). */
    popupId: string;
    open: () => void;
}

const command = (value: string) => () => eventBus.emit('sendCommand', { command: value });

/** Every window, in the order players know; all of them, always (no overflow). */
const WINDOW_LAUNCHERS: WindowLauncher[] = [
    { label: 'Wiedza', icon: BookOpen, popupId: 'popup:knowledgeDetails', open: command('/wiedza') },
    { label: 'Biblioteki', icon: Library, popupId: 'popup:knowledgeReport', open: command('/biblioteki') },
    { label: 'Zioła', icon: Leaf, popupId: 'popup:herb', open: command('/ziola') },
    { label: 'Zioła (tekst)', icon: FileText, popupId: 'popup:herb-text', open: command('/ziola2') },
    { label: 'Zlecenia', icon: ScrollText, popupId: 'popup:contracts', open: command('/zlecenia') },
    { label: 'Wozy', icon: Caravan, popupId: 'popup:carriages', open: command('/wozw') },
    { label: 'Skróty', icon: Zap, popupId: 'popup:skroty', open: () => eventBus.emit('skroty.popup.open') },
    { label: 'Zegar', icon: Clock, popupId: 'popup:clock', open: command('/czas') },
    { label: 'Chat', icon: MessageCircle, popupId: 'popup:chat', open: command('/chatw') },
    { label: 'Walka', icon: Swords, popupId: 'popup:combat', open: command('/walkaw') },
    { label: 'Statystyki', icon: PieChart, popupId: 'popup:stat', open: () => eventBus.emit('stat.popup.open') },
    { label: 'Postępy', icon: TrendingUp, popupId: 'popup:postepy', open: () => eventBus.emit('postepy.popup.open') },
    { label: 'Postępy 2', icon: BarChart3, popupId: 'popup:postepy2', open: () => eventBus.emit('postepy2.popup.open') },
    { label: 'Cechy', icon: Dumbbell, popupId: 'popup:cechy', open: () => eventBus.emit('cechy.popup.open') },
    { label: 'Zabici', icon: Skull, popupId: 'popup:zabici', open: () => eventBus.emit('zabici.popup.open') },
    { label: 'Zabici 2', icon: ClipboardList, popupId: 'popup:zabici2', open: () => eventBus.emit('zabici2.popup.open') },
    { label: 'Poczta', icon: Mail, popupId: 'popup:poczta', open: () => eventBus.emit('poczta.popup.open') },
    { label: 'Depozyty', icon: Coins, popupId: 'popup:deposits', open: () => eventBus.emit('deposits.popup.open', {}) },
    { label: 'Wędka', icon: Fish, popupId: 'popup:fishing', open: command('/wedka') },
    { label: 'Kalendarz', icon: Calendar, popupId: 'popup:sunTracker', open: () => eventBus.emit('sunTracker.popup.open') },
    { label: 'Zawód', icon: Wrench, popupId: 'popup:profession', open: () => eventBus.emit('profession.popup.open') },
    { label: 'Złom', icon: Shield, popupId: 'popup:zlom', open: () => eventBus.emit('zlom.popup.open') },
    { label: 'Odporności', icon: ShieldHalf, popupId: 'popup:enemyResistances', open: () => eventBus.emit('enemyResistances.popup.open') },
    { label: 'Oswajanie', icon: PawPrint, popupId: 'popup:oswajanie', open: () => eventBus.emit('oswajanie.popup.open', {}) },
];

/** The longest selection quoted in the "Szukaj w logach" row. */
const QUOTE_MAX = 28;

function quote(text: string): string {
    return text.length > QUOTE_MAX ? `"${text.slice(0, QUOTE_MAX - 1)}…"` : `"${text}"`;
}

export function buildOutputContextMenuItems(
    selection: string,
    { messageWrappersSupported = true, messageMetadataToggles = true }: OutputContextMenuOptions = {},
): ContextMenuEntry[] {
    const items: ContextMenuEntry[] = [];
    // One line of it: a search over the logs matches within a line.
    const selected = selection.replace(/\s+/g, ' ').trim();

    if (selected) {
        const section = 'Zaznaczenie';
        items.push({
            section,
            label: 'Kopiuj',
            icon: Copy,
            hint: 'Ctrl+C',
            // The output's own copy handler shapes the text (no timestamps).
            action: () => document.execCommand('copy'),
        });
        if (messageWrappersSupported) {
            items.push(
                {
                    section,
                    label: 'Kopiuj jako obraz',
                    icon: Image,
                    action: () => {
                        copyOutputAsImage().catch(err => console.error('Failed to copy as image:', err));
                    },
                },
                {
                    section,
                    label: 'Zapisz jako HTML',
                    icon: FileCode,
                    action: () => {
                        saveOutputAsHtml().catch(err => console.error('Failed to save as HTML:', err));
                    },
                },
            );
        }
        if (canSearchLogs()) {
            items.push({
                section,
                label: (
                    <>
                        Szukaj w logach: <span className="context-menu__quote">{quote(selected)}</span>
                    </>
                ),
                icon: Search,
                action: () => requestLogSearch(selected),
            });
        }
    }

    if (messageMetadataToggles) {
        const timestampsVisible = areOutputTimestampsVisible();
        const typesVisible = areOutputMessageTypesVisible();
        items.push(
            {
                section: 'Widok',
                label: 'Znaczniki czasu',
                checked: timestampsVisible,
                action: () => {
                    const next = !timestampsVisible;
                    setOutputTimestampVisibility(next);
                    setRenderSettings({ showTimestamps: next });
                },
            },
            {
                section: 'Widok',
                label: 'Typy wiadomości',
                checked: typesVisible,
                action: () => setOutputMessageTypeVisibility(!typesVisible),
            },
        );
    }

    for (const launcher of WINDOW_LAUNCHERS) {
        items.push({
            section: 'Okna',
            variant: 'tile',
            label: launcher.label,
            icon: launcher.icon,
            active: hasPopup(launcher.popupId),
            action: launcher.open,
        });
    }

    for (const entry of getPluginContextMenuEntries()) {
        items.push({ icon: Puzzle, ...entry, section: 'Wtyczki' });
    }

    return items;
}

export function setupOutputContextMenu(
    outputWrapper: HTMLElement,
    options: OutputContextMenuOptions = {},
): () => void {
    const handler = (event: MouseEvent) => {
        if (event.defaultPrevented) return;
        if (isMobileLikeViewport()) return;
        const target = event.target as HTMLElement | null;
        if (target && target.closest('a, [data-output-clickable]')) return;
        event.preventDefault();

        const selection = window.getSelection();
        const text = selection && !selection.isCollapsed ? selection.toString() : '';
        showContextMenu(buildOutputContextMenuItems(text, options), event.clientX, event.clientY, { width: 380 });
    };

    outputWrapper.addEventListener('contextmenu', handler);
    return () => outputWrapper.removeEventListener('contextmenu', handler);
}
