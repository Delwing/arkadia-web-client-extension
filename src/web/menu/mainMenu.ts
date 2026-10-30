import eventBus from "@modules/core/eventBus";
import {registerMainMenuItem, type MainMenuGroup} from "@modules/core/mainMenuRegistry";
import {setWidgetEditMode} from "@modules/core/widgetLayout";
import {isHelperSupported} from "../helperDownload";
import {requestSettingsResume} from "../settings/categories";

/** The page-level windows the built-in entries open. */
export type MainMenuModal = 'automation' | 'binds' | 'places' | 'recordings' | 'scripts' | 'helper' | 'settings';

export interface MainMenuActions {
    openModal(modal: MainMenuModal): void;
    shareLocation(): void;
    isConnected(): boolean;
    toggleConnection(): void;
}

export function toggleFullscreen(doc: Document = document): void {
    if (!doc.fullscreenElement) {
        doc.documentElement.requestFullscreen().catch(err => console.error('Failed to enter fullscreen:', err));
    } else {
        doc.exitFullscreen().catch(err => console.error('Failed to exit fullscreen:', err));
    }
}

/** The ⋯ menu next to the command line: the client's own entries (Logi registers itself). */
export function registerBuiltinMainMenu(actions: MainMenuActions): void {
    const open = (modal: MainMenuModal) => () => actions.openModal(modal);
    const builtins: [string, string, MainMenuGroup, string, () => void, string?, string[]?][] = [
        ['automation-button', 'Skrypty', 'gra', 'zap', open('automation'), undefined, ['aliasy', 'triggery', 'wyzwalacze', 'automatyzacja']],
        ['binds-button', 'Klawisze', 'gra', 'keyboard', open('binds')],
        ['places-button', 'Miejsca', 'gra', 'map-pin', open('places')],
        ['recordings-button', 'Nagrania', 'gra', 'record', open('recordings')],
        ['people-browser-button', 'Baza postaci', 'gra', 'users', () => eventBus.emit('peopleBrowser.popup.open')],
        ['npc-button', 'Odbiorcy paczek', 'gra', 'package', () => eventBus.emit('packageReceiver.popup.open')],
        ['share-location-button', 'Kod QR lokacji', 'gra', 'qr-code', () => actions.shareLocation(), 'Kod QR'],
        ['scripts-button', 'Wtyczki', 'narzedzia', 'code', open('scripts'), undefined, ['skrypty', 'pluginy']],
        ['data-sources-button', 'Źródła danych', 'narzedzia', 'database', () => eventBus.emit('dataSources.popup.open')],
        ['helper-button', 'Helper', 'narzedzia', 'plug', open('helper')],
    ];
    builtins.filter(([id]) => id !== 'helper-button' || isHelperSupported()).forEach(([id, label, group, icon, onSelect, shortLabel, keywords], index) => {
        registerMainMenuItem({id, label, shortLabel, keywords, group, icon, order: (index + 1) * 10, onSelect, source: 'builtin'});
    });
    // One entry for the whole dialog: it opens where it was left (page, unsaved edits).
    registerMainMenuItem({
        id: 'settings-button', label: 'Ustawienia', group: 'ustawienia', icon: 'settings', order: 5, onSelect: () => { requestSettingsResume(); actions.openModal('settings'); }, source: 'builtin',
        keywords: ['opcje', 'postać', 'interfejs', 'przyciski', 'menu kołowe', 'eksport', 'import', 'synchronizacja', 'kopia'],
    });
    registerMainMenuItem({
        id: 'widgets-button', label: 'Widżety', group: 'narzedzia', icon: 'widgets', order: 160, onSelect: () => setWidgetEditMode(true), source: 'builtin',
        keywords: ['zegar', 'kompas', 'witalne', 'transport', 'nakładka', 'hud'],
    });
    // Logi (170) registers itself in Narzędzia.
    registerMainMenuItem({id: 'docs-button', label: 'Dokumentacja', shortLabel: 'Pomoc', group: 'narzedzia', icon: 'book', order: 180, onSelect: () => eventBus.emit('docs.popup.open'), source: 'builtin'});
    registerMainMenuItem({id: 'fullscreen-button', label: 'Pełny ekran', group: 'sesja', icon: 'fullscreen', order: 900, onSelect: () => toggleFullscreen(), source: 'builtin'});
    registerMainMenuItem({id: 'disconnect-button', label: actions.isConnected() ? 'Rozłącz' : 'Połącz', group: 'sesja', icon: 'power', order: 910, onSelect: () => actions.toggleConnection(), tone: 'danger', source: 'builtin'});
}
