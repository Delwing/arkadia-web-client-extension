import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import type Client from '@client/Client';
import MenuModal from './MenuModal';
import { getHelperConnection } from '../../client/bootstrap';

// The stock settings/editors are lazy-loaded. They are heavy (Monaco, sql.js, …)
// AND they transitively import the stock global `src/web/style.css` (via
// options/Settings.tsx). Pulling that into forge's INITIAL bundle reorders the
// built CSS chunks so those id-based stock rules (#content-area,
// #main_text_output_msg_wrapper, …) win over forge's theming — adding stray
// backgrounds to the output/footer/panels. Loading them as async chunks keeps
// forge's initial CSS (and cascade) intact; the chunks only arrive when a modal
// opens, after forge's stylesheet is already applied.
const CharacterSettings = lazy(() => import('@web/options/CharacterSettings'));
const UiSettings = lazy(() => import('@web/uiSettings/UiSettings'));
const ExportImport = lazy(() => import('@web/options/ExportImport'));
const CharacterManagement = lazy(() => import('@web/options/CharacterManagementModal'));
const Binds = lazy(() => import('@web/options/Binds'));
const Scripts = lazy(() => import('@web/options/Scripts'));
const Aliases = lazy(() => import('@web/options/Aliases'));
const UserTriggers = lazy(() => import('@web/options/UserTriggers'));
const Recordings = lazy(() => import('@web/options/Recordings'));
const Shortcuts = lazy(() => import('@web/options/Shortcuts'));
const LocationNotes = lazy(() => import('@web/options/LocationNotes'));
const ButtonsSettings = lazy(() => import('@web/options/ButtonsSettings'));
const MobileRadialCommands = lazy(() => import('@web/options/MobileRadialCommands'));
const HelperSettings = lazy(() => import('@web/options/HelperSettings'));
const LogBrowser = lazy(() => import('@web/LogBrowser').then((m) => ({ default: m.LogBrowser })));

/**
 * The keys the forge menu can open as a modal. Kept in sync with the menu items
 * in Menu.tsx.
 */
export type ModalKey =
    | 'options'
    | 'ui'
    | 'export-import'
    | 'characters'
    | 'binds'
    | 'scripts'
    | 'aliases'
    | 'triggers'
    | 'recordings'
    | 'shortcuts'
    | 'location-notes'
    | 'buttons'
    | 'radial'
    | 'helper'
    | 'logs'
    | 'docs';

interface MenuModalHostProps {
    activeKey: ModalKey | null;
    client: Client;
    onClose: () => void;
    /** Lets a modal switch to a sibling (options → export/import or characters). */
    setActiveKey: (key: ModalKey) => void;
}

const TITLES: Record<ModalKey, string> = {
    options: 'Opcje',
    ui: 'Ustawienia UI',
    'export-import': 'Eksport i import ustawień',
    characters: 'Zarządzanie postaciami',
    binds: 'Bindowanie',
    scripts: 'Skrypty',
    aliases: 'Aliasy',
    triggers: 'Triggery',
    recordings: 'Nagrania',
    shortcuts: 'Skróty',
    'location-notes': 'Notatki lokacji',
    buttons: 'Przyciski',
    radial: 'Menu kołowe',
    helper: 'Arkadia Helper',
    logs: 'Logi',
    docs: 'Dokumentacja',
};

const SIZE: Partial<Record<ModalKey, 'md' | 'lg' | 'xl'>> = {
    characters: 'md',
    helper: 'xl',
    logs: 'xl',
    docs: 'xl',
};

/** Docs render imperatively (plain DOM) into a container; loaded on demand so
 *  the heavy markdown bundle stays out of forge's initial chunk. */
function DocsBody() {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        let cancelled = false;
        void import('@web/docs').then(({ mountDocs }) => {
            if (!cancelled && ref.current) mountDocs(ref.current);
        });
        return () => {
            cancelled = true;
        };
    }, []);
    return <div ref={ref} className="forge-docs-host" style={{ minHeight: 0, flex: '1 1 auto', display: 'flex', flexDirection: 'column' }} />;
}

export default function MenuModalHost({ activeKey, client, onClose, setActiveKey }: MenuModalHostProps) {
    // Several option components dispatch these on save/cancel (the same contract
    // the stock Bootstrap modals honour). Mirror the stock host: close on either.
    useEffect(() => {
        if (!activeKey) return;
        const close = () => onClose();
        window.addEventListener('close-options', close);
        window.addEventListener('close-ui-settings', close);
        // Options → sibling modals, dispatched by the options header buttons.
        const toExport = () => setActiveKey('export-import');
        const toChars = () => setActiveKey('characters');
        window.addEventListener('show-export-import', toExport);
        window.addEventListener('show-character-management', toChars);
        return () => {
            window.removeEventListener('close-options', close);
            window.removeEventListener('close-ui-settings', close);
            window.removeEventListener('show-export-import', toExport);
            window.removeEventListener('show-character-management', toChars);
        };
    }, [activeKey, onClose, setActiveKey]);

    // The general-settings panel expects this on open (selects its first tab).
    useEffect(() => {
        if (activeKey === 'options') {
            window.dispatchEvent(new Event('show-general-settings'));
        }
    }, [activeKey]);

    // UiSettings hooks the Bootstrap show/hidden lifecycle of `#ui-settings-modal`
    // to refresh its draft on open and restore live-previewed values on dismiss.
    // Replicate those DOM events around this modal's lifetime.
    useEffect(() => {
        if (activeKey !== 'ui') return;
        const el = document.getElementById('ui-settings-modal');
        el?.dispatchEvent(new Event('show.bs.modal'));
        return () => {
            el?.dispatchEvent(new Event('hidden.bs.modal'));
        };
    }, [activeKey]);

    if (!activeKey) return null;

    const title = TITLES[activeKey];
    const size = SIZE[activeKey] ?? 'lg';

    // Footer Save buttons — only the two panels that carry one in the stock UI.
    let footer: ReactNode = null;
    if (activeKey === 'options') {
        footer = (
            <button
                type="button"
                className="btn btn-primary"
                onClick={() => window.dispatchEvent(new Event('save-options'))}
            >
                Zapisz
            </button>
        );
    } else if (activeKey === 'ui') {
        footer = (
            <button
                type="button"
                className="btn btn-primary"
                onClick={() => window.dispatchEvent(new Event('save-ui-settings'))}
            >
                Zapisz
            </button>
        );
    }

    // The options panel offers export/import + character shortcuts in its header.
    let headerExtras: ReactNode = null;
    if (activeKey === 'options') {
        headerExtras = (
            <>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveKey('export-import')}>
                    Eksport/Import
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveKey('characters')}>
                    Postacie
                </button>
            </>
        );
    }

    let body: ReactNode;
    switch (activeKey) {
        case 'options':
            body = <CharacterSettings />;
            break;
        case 'ui':
            body = (
                <UiSettings
                    soundManager={client.SoundManager}
                    onEnableNotifications={() => client.enableNotifications()}
                />
            );
            break;
        case 'export-import':
            body = <ExportImport />;
            break;
        case 'characters':
            body = <CharacterManagement />;
            break;
        case 'binds':
            body = <Binds />;
            break;
        case 'scripts':
            body = <Scripts />;
            break;
        case 'aliases':
            body = <Aliases />;
            break;
        case 'triggers':
            body = <UserTriggers />;
            break;
        case 'recordings':
            body = <Recordings />;
            break;
        case 'shortcuts':
            body = <Shortcuts />;
            break;
        case 'location-notes':
            body = <LocationNotes />;
            break;
        case 'buttons':
            body = <ButtonsSettings />;
            break;
        case 'radial':
            body = <MobileRadialCommands />;
            break;
        case 'helper': {
            const helper = getHelperConnection();
            body = helper ? <HelperSettings helperConnection={helper} /> : <p>Helper niedostępny.</p>;
            break;
        }
        case 'logs':
            body = <LogBrowser />;
            break;
        case 'docs':
            body = <DocsBody />;
            break;
    }

    return (
        <MenuModal
            title={title}
            size={size}
            onClose={onClose}
            dialogId={activeKey === 'ui' ? 'ui-settings-modal' : undefined}
            headerExtras={headerExtras}
            footer={footer}
        >
            <Suspense fallback={<p className="forge-menu-loading">Ładowanie…</p>}>{body}</Suspense>
        </MenuModal>
    );
}
