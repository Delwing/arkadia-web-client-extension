import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import type Client from '@client/Client';
import MenuModal from './MenuModal';
import { holdPortaledModalScope } from './portaledModalScope';
import { getHelperConnection } from '../../client/bootstrap';

// The stock settings panels are lazy-loaded to keep their weight out of forge's
// initial bundle: together they're ~140 kB gzip of JS (Skrypty alone is ~40 kB,
// mostly the inlined PLUGINS.md + plugin type defs its AI-prompt builder embeds).
// Forge's own entry is only ~16 kB gzip, so eager-importing the set would several-
// fold the startup payload for panels most sessions never open. So they stay async.
// (Their genuinely heavy dependencies — esbuild-wasm for plugin import, sql.js for
// data imports, the logs export — are all `?worker` chunks that load on demand
// regardless of this, and Monaco is not here at all: it lives only in the separate
// editor/ entry. So this is purely about the panels' own JS.)
// (There was a second reason once — these components transitively imported stock's
// global style.css and reordered forge's CSS cascade — but that leak was closed
// upstream: options/Settings.tsx no longer imports it. Bundle weight is the only
// live reason now.)
//
// Single source of truth for each modal's chunk loader. `lazy()` consumes these
// below, and `prefetchAllModals()` calls them to warm every chunk in the
// background after forge's initial render — so a modal's first open is already
// resolved (no "Ładowanie…" flash), while the heavy `?worker` deps still never
// touch the startup path.
const load = {
    options: () => import('@web/options/CharacterSettings'),
    ui: () => import('@web/uiSettings/UiSettings'),
    'export-import': () => import('@web/options/ExportImport'),
    characters: () => import('@web/options/CharacterManagementModal'),
    binds: () => import('@web/options/Binds'),
    scripts: () => import('@web/options/Scripts'),
    aliases: () => import('@web/options/Aliases'),
    triggers: () => import('@web/options/UserTriggers'),
    recordings: () => import('@web/options/Recordings'),
    shortcuts: () => import('@web/options/Shortcuts'),
    'location-notes': () => import('@web/options/LocationNotes'),
    buttons: () => import('@web/options/ButtonsSettings'),
    radial: () => import('@web/options/MobileRadialCommands'),
    helper: () => import('@web/options/HelperSettings'),
    logs: () => import('@web/LogBrowser'),
    docs: () => import('@web/docs'),
} satisfies Record<string, () => Promise<unknown>>;

const CharacterSettings = lazy(load.options);
const UiSettings = lazy(load.ui);
const ExportImport = lazy(load['export-import']);
const CharacterManagement = lazy(load.characters);
const Binds = lazy(load.binds);
const Scripts = lazy(load.scripts);
const Aliases = lazy(load.aliases);
const UserTriggers = lazy(load.triggers);
const Recordings = lazy(load.recordings);
const Shortcuts = lazy(load.shortcuts);
const LocationNotes = lazy(load['location-notes']);
const ButtonsSettings = lazy(load.buttons);
const MobileRadialCommands = lazy(load.radial);
const HelperSettings = lazy(load.helper);
const LogBrowser = lazy(() => load.logs().then((m) => ({ default: m.LogBrowser })));

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

/**
 * Warms every modal's code (and the shared scoped-Bootstrap CSS) in the
 * background, so opening any of them never flashes the Suspense "Ładowanie…"
 * fallback. The menu calls this once, on an idle callback after forge's initial
 * render — it downloads only the panels' own JS (~140 kB gzip); their heavy
 * `?worker` deps (esbuild-wasm, sql.js) aren't instantiated by import, so they
 * stay on-demand. Idempotent and safe to call repeatedly (the browser/Vite
 * dedupe the dynamic imports).
 */
export function prefetchAllModals(): void {
    // The scoped stylesheet the editors are built against loads with the first
    // modal too; warm it once so the panel paints styled, not just un-suspended.
    void import('./scopedModalCss');
    for (const loader of Object.values(load)) void loader();
}

interface MenuModalHostProps {
    /** The modal stack, bottom-to-top. Stock hosts these as independent Bootstrap
     *  modals that can stack (e.g. Postacie opens *over* Opcje at a higher
     *  z-index); a stack reproduces that instead of the old single-active key. */
    stack: ModalKey[];
    client: Client;
    /** Pop a specific modal off the stack (its close button / backdrop / Esc). */
    closeKey: (key: ModalKey) => void;
    /** Pop the front-most modal — used by the components' close-* window events. */
    closeTop: () => void;
    /** Open a sibling on top, keeping the opener behind (stock's Postacie ↑ Opcje). */
    pushKey: (key: ModalKey) => void;
    /** Swap the front-most modal for a sibling (stock's Eksport/Import hides Opcje). */
    replaceKey: (key: ModalKey) => void;
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

/**
 * Panels whose body scrolls *internally* — they fill the shell and scroll a
 * region inside themselves (a tabbed settings form, an export/import pane) rather
 * than letting the modal body scroll as one block. Their layout hangs off a
 * percentage-height (`h-100`) chain that only resolves against a *definite*-height
 * ancestor; forge's default `max-height: 92vh` shell is content-sized (indefinite),
 * so without this flag the inner scroller balloons to full content height and gets
 * clipped by its `overflow: hidden` wrapper — no scrollbar, content unreachable.
 * The `fill` flag gives these a definite full-height shell (matching the stock
 * dialogs these components were authored against, which carry `h-100`). Flowing
 * panels stay content-sized so short ones don't stretch into a tall empty box.
 */
const FILL_MODALS: ReadonlySet<ModalKey> = new Set(['options', 'ui', 'export-import', 'radial']);

const SIZE: Partial<Record<ModalKey, 'md' | 'lg' | 'xl'>> = {
    // The two dense settings panels flow their sections into a 2–3 column
    // masonry (see .ui-settings-layout in stock-settings.css); give them the
    // wide shell so all three columns fit, matching stock's wide settings modal.
    options: 'xl',
    ui: 'xl',
    characters: 'md',
    helper: 'xl',
    logs: 'xl',
    docs: 'xl',
};

/**
 * Fires the "modal shown/hidden" signals a couple of stock panels expect on open.
 * Rendered *inside* the Suspense boundary (alongside the lazy body) so its effects
 * run in the same commit the body mounts in — i.e. once the dialog is actually in
 * the DOM. Kept out of MenuModalEntry so the boundary can wrap the whole modal
 * (header included) without these dispatching before the shell exists.
 */
function ModalOpenEffects({ modalKey }: { modalKey: ModalKey }) {
    // The general-settings panel selects its first tab on this.
    useEffect(() => {
        if (modalKey === 'options') {
            window.dispatchEvent(new Event('show-general-settings'));
        }
    }, [modalKey]);

    // UiSettings hooks the Bootstrap show/hidden lifecycle of `#ui-settings-modal`
    // to refresh its draft on open and restore live-previewed values on dismiss.
    useEffect(() => {
        if (modalKey !== 'ui') return;
        const el = document.getElementById('ui-settings-modal');
        el?.dispatchEvent(new Event('show.bs.modal'));
        return () => {
            el?.dispatchEvent(new Event('hidden.bs.modal'));
        };
    }, [modalKey]);

    return null;
}

/** Docs render imperatively (plain DOM) into a container; loaded on demand so
 *  the heavy markdown bundle stays out of forge's initial chunk. */
function DocsBody() {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        let cancelled = false;
        void load.docs().then(({ mountDocs }) => {
            if (!cancelled && ref.current) mountDocs(ref.current);
        });
        return () => {
            cancelled = true;
        };
    }, []);
    return <div ref={ref} className="forge-docs-host" style={{ minHeight: 0, flex: '1 1 auto', display: 'flex', flexDirection: 'column' }} />;
}

/** The Bindowanie modal's import trigger, hosted in the title bar. It drives the
 *  shared <Binds/> body through a window event and reflects the parsing state the
 *  body broadcasts back (disabled + label swap), matching the stock header button. */
function BindsImportButton() {
    const [parsing, setParsing] = useState(false);
    useEffect(() => {
        const onParsing = (ev: Event) => setParsing(!!(ev as CustomEvent<boolean>).detail);
        window.addEventListener('binds-parsing', onParsing);
        return () => window.removeEventListener('binds-parsing', onParsing);
    }, []);
    return (
        <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={parsing}
            onClick={() => window.dispatchEvent(new Event('binds-open-import'))}
        >
            {parsing ? 'Wczytywanie…' : 'Importuj bazę multibindów…'}
        </button>
    );
}

interface MenuModalEntryProps {
    modalKey: ModalKey;
    /** True for the front-most modal; only it responds to Esc. */
    isTop: boolean;
    client: Client;
    onClose: () => void;
    pushKey: (key: ModalKey) => void;
    replaceKey: (key: ModalKey) => void;
}

/** Renders a single modal in the stack, with the per-key body, chrome and the
 *  lifecycle DOM events its stock component expects. */
function MenuModalEntry({ modalKey, isTop, client, onClose, pushKey, replaceKey }: MenuModalEntryProps) {
    const title = TITLES[modalKey];
    const size = SIZE[modalKey] ?? 'lg';
    const fill = FILL_MODALS.has(modalKey);

    // Footer Save buttons — only the two panels that carry one in the stock UI.
    let footer: ReactNode = null;
    if (modalKey === 'options') {
        footer = (
            <button
                type="button"
                className="btn btn-primary"
                onClick={() => window.dispatchEvent(new Event('save-options'))}
            >
                Zapisz
            </button>
        );
    } else if (modalKey === 'ui') {
        footer = (
            <button
                type="button"
                className="btn btn-primary"
                onClick={() => window.dispatchEvent(new Event('save-ui-settings'))}
            >
                Zapisz
            </button>
        );
    } else if (modalKey === 'binds') {
        footer = (
            <>
                <button
                    type="button"
                    className="btn btn-secondary me-auto"
                    onClick={() => window.dispatchEvent(new Event('binds-add-custom'))}
                >
                    Dodaj skrót
                </button>
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => window.dispatchEvent(new Event('binds-save'))}
                >
                    Zapisz
                </button>
            </>
        );
    }

    // The options panel offers export/import + character shortcuts in its header.
    // Stock hides Opcje for Eksport/Import (a replace) but stacks Postacie on top
    // at a higher z-index (a push) — mirror both here.
    let headerExtras: ReactNode = null;
    if (modalKey === 'options') {
        headerExtras = (
            <>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => replaceKey('export-import')}>
                    Eksport/Import
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => pushKey('characters')}>
                    Postacie
                </button>
            </>
        );
    } else if (modalKey === 'binds') {
        headerExtras = <BindsImportButton />;
    }

    let body: ReactNode;
    switch (modalKey) {
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

    // The boundary wraps the WHOLE modal (not just the body) so the shell doesn't
    // paint before its content is ready — otherwise the header commits instantly
    // and the lazy body (a big settings form, several frames to first-render even
    // when the code is warm) pops in a beat later. With the boundary hoisted,
    // React withholds the entire modal until the body is ready, so header + body
    // appear together. Chunks are warm (idle prefetch), so that's ~a frame; the
    // null fallback shows nothing in the rare cold case (the closing dropdown is
    // the click's feedback) rather than a bare, chrome-less spinner.
    return (
        <Suspense fallback={null}>
            <MenuModal
                title={title}
                size={size}
                fill={fill}
                onClose={onClose}
                closeOnEsc={isTop}
                dialogId={modalKey === 'ui' ? 'ui-settings-modal' : undefined}
                headerExtras={headerExtras}
                footer={footer}
            >
                <ModalOpenEffects modalKey={modalKey} />
                {body}
            </MenuModal>
        </Suspense>
    );
}

export default function MenuModalHost({ stack, client, closeKey, closeTop, pushKey, replaceKey }: MenuModalHostProps) {
    const open = stack.length > 0;

    // Several option components dispatch these on save/cancel (the same contract
    // the stock Bootstrap modals honour) — they mean "dismiss the current modal",
    // so close the front-most one. Others dispatch the show-* events to open a
    // sibling (the same events stock's option headers fire).
    useEffect(() => {
        if (!open) return;
        const close = () => closeTop();
        const toExport = () => pushKey('export-import');
        const toChars = () => pushKey('characters');
        window.addEventListener('close-options', close);
        window.addEventListener('close-ui-settings', close);
        window.addEventListener('show-export-import', toExport);
        window.addEventListener('show-character-management', toChars);
        return () => {
            window.removeEventListener('close-options', close);
            window.removeEventListener('close-ui-settings', close);
            window.removeEventListener('show-export-import', toExport);
            window.removeEventListener('show-character-management', toChars);
        };
    }, [open, closeTop, pushKey]);

    // Inject the scoped Bootstrap stylesheet the editors are built against, the
    // first time any modal opens (kept out of forge's initial chunk). See
    // scopedModalCss.ts.
    useEffect(() => {
        if (!open) return;
        void import('./scopedModalCss').then((m) => m.injectScopedModalCss());
    }, [open]);

    // Several panels open a react-bootstrap <Modal> as a sub-dialog; those portal
    // to <body>, outside every `.forge-menu-modal …` selector. Tag them so the
    // stylesheet above reaches them. See portaledModalScope.ts.
    useEffect(() => {
        if (!open) return;
        return holdPortaledModalScope();
    }, [open]);

    if (!open) return null;

    return (
        <>
            {stack.map((key, i) => (
                <MenuModalEntry
                    key={key}
                    modalKey={key}
                    isTop={i === stack.length - 1}
                    client={client}
                    onClose={() => closeKey(key)}
                    pushKey={pushKey}
                    replaceKey={replaceKey}
                />
            ))}
        </>
    );
}
