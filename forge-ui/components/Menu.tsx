import { useCallback, useEffect, useRef, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import mudClient from '@web/MudClient';
import { useClient } from '../client/ClientContext';
import MenuModalHost, { prefetchAllModals, type ModalKey } from './menu/MenuModalHost';
import MenuModal from './menu/MenuModal';

/**
 * The forge menu — the command-rail counterpart of the stock UI's "⋮" dropdown.
 *
 * A forged rune button opens a dropdown (upward, since the rail sits at the
 * bottom) listing the same actions as the stock menu. Items fall into a few
 * kinds: modal editors hosted by {@link MenuModalHost} (settings, scripts,
 * triggers, docs, logs, …); dockable popups already mounted in forge via the
 * shared POPUP_CATALOG, opened by emitting their `*.popup.open` event; and a few
 * direct actions (QR, disconnect, fullscreen).
 */

type Item =
    | { kind: 'modal'; label: string; modal: ModalKey }
    | { kind: 'event'; label: string; event: 'packageReceiver.popup.open' | 'peopleBrowser.popup.open' | 'dataSources.popup.open' }
    | { kind: 'action'; label: string; action: 'qr' | 'disconnect' | 'fullscreen' }
    | { kind: 'divider' };

const ITEMS: Item[] = [
    { kind: 'modal', label: 'Ustawienia', modal: 'options' },
    { kind: 'modal', label: 'Eksport / import', modal: 'export-import' },
    { kind: 'modal', label: 'Interfejs', modal: 'ui' },
    { kind: 'modal', label: 'Przyciski', modal: 'buttons' },
    { kind: 'modal', label: 'Menu kołowe', modal: 'radial' },
    { kind: 'modal', label: 'Bindowanie', modal: 'binds' },
    { kind: 'divider' },
    { kind: 'event', label: 'Odbiorcy paczek', event: 'packageReceiver.popup.open' },
    { kind: 'modal', label: 'Skrypty', modal: 'scripts' },
    { kind: 'modal', label: 'Aliasy', modal: 'aliases' },
    { kind: 'modal', label: 'Triggery', modal: 'triggers' },
    { kind: 'modal', label: 'Nagrania', modal: 'recordings' },
    { kind: 'modal', label: 'Skróty', modal: 'shortcuts' },
    { kind: 'modal', label: 'Notatki lokacji', modal: 'location-notes' },
    { kind: 'divider' },
    { kind: 'event', label: 'Baza postaci', event: 'peopleBrowser.popup.open' },
    { kind: 'event', label: 'Źródła danych', event: 'dataSources.popup.open' },
    { kind: 'modal', label: 'Dokumentacja', modal: 'docs' },
    { kind: 'modal', label: 'Logi', modal: 'logs' },
    { kind: 'divider' },
    { kind: 'action', label: 'Kod QR lokacji', action: 'qr' },
    { kind: 'modal', label: 'Helper', modal: 'helper' },
    { kind: 'action', label: 'Rozłącz', action: 'disconnect' },
    { kind: 'action', label: 'Pełny ekran', action: 'fullscreen' },
];

export default function Menu() {
    const client = useClient();
    const [open, setOpen] = useState(false);
    // A stack (bottom-to-top) rather than a single key, so siblings can stack the
    // way stock's independent Bootstrap modals do (Postacie over Opcje).
    const [modalStack, setModalStack] = useState<ModalKey[]>([]);
    const [qrUrl, setQrUrl] = useState<string | null>(null);

    const openModal = useCallback((key: ModalKey) => setModalStack([key]), []);
    const closeTop = useCallback(() => setModalStack((s) => s.slice(0, -1)), []);
    const closeKey = useCallback(
        (key: ModalKey) => setModalStack((s) => s.filter((k) => k !== key)),
        [],
    );
    const pushKey = useCallback(
        (key: ModalKey) => setModalStack((s) => (s.includes(key) ? s : [...s, key])),
        [],
    );
    const replaceKey = useCallback(
        (key: ModalKey) => setModalStack((s) => [...s.slice(0, -1), key]),
        [],
    );
    const rootRef = useRef<HTMLDivElement>(null);

    // Once forge has painted, warm every modal chunk in the background so the
    // first open of any of them is instant (no "Ładowanie…" flash) — without
    // adding their weight to the startup path. Runs on an idle callback so it
    // never competes with initial render / client bootstrap.
    useEffect(() => {
        let idleId: number | undefined;
        let timeoutId: number | undefined;
        const warm = () => prefetchAllModals();
        if (typeof window.requestIdleCallback === 'function') {
            idleId = window.requestIdleCallback(warm, { timeout: 3000 });
        } else {
            timeoutId = window.setTimeout(warm, 2000);
        }
        return () => {
            if (idleId !== undefined) window.cancelIdleCallback(idleId);
            if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        };
    }, []);

    // Close the dropdown on any outside click.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('pointerdown', onDown, true);
        return () => document.removeEventListener('pointerdown', onDown, true);
    }, [open]);

    const showQr = useCallback(() => {
        const roomId = client.Map.currentRoom?.id;
        if (!roomId) return;
        const url = new URL(window.location.origin + window.location.pathname);
        url.searchParams.set('locationId', roomId.toString());
        setQrUrl(
            `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url.toString())}`,
        );
    }, [client]);

    const runAction = useCallback(
        (action: 'qr' | 'disconnect' | 'fullscreen') => {
            switch (action) {
                case 'qr':
                    showQr();
                    break;
                case 'disconnect':
                    if (mudClient.isSocketOpen()) {
                        mudClient.disconnect();
                    } else {
                        mudClient.connect();
                    }
                    break;
                case 'fullscreen':
                    if (!document.fullscreenElement) {
                        void document.documentElement.requestFullscreen().catch(() => {});
                    } else {
                        void document.exitFullscreen().catch(() => {});
                    }
                    break;
            }
        },
        [showQr],
    );

    const onItem = useCallback(
        (item: Item) => {
            setOpen(false);
            if (item.kind === 'modal') openModal(item.modal);
            else if (item.kind === 'event') eventBus.emit(item.event);
            else if (item.kind === 'action') runAction(item.action);
        },
        [runAction, openModal],
    );

    return (
        <div className="forge-menu" ref={rootRef}>
            <button
                type="button"
                className={'forge-menu__button' + (open ? ' forge-menu__button--open' : '')}
                title="Menu"
                onClick={() => setOpen((v) => !v)}
            >
                <svg viewBox="0 0 20 20" width="18" height="18">
                    <circle cx="10" cy="4" r="1.5" fill="currentColor" />
                    <circle cx="10" cy="10" r="1.5" fill="currentColor" />
                    <circle cx="10" cy="16" r="1.5" fill="currentColor" />
                </svg>
            </button>

            {open && (
                <ul className="forge-menu__list">
                    {ITEMS.map((item, i) =>
                        item.kind === 'divider' ? (
                            <li key={i} className="forge-menu__divider" />
                        ) : (
                            <li key={i}>
                                <button type="button" className="forge-menu__item" onClick={() => onItem(item)}>
                                    {item.label}
                                </button>
                            </li>
                        ),
                    )}
                </ul>
            )}

            <MenuModalHost
                stack={modalStack}
                client={client}
                closeKey={closeKey}
                closeTop={closeTop}
                pushKey={pushKey}
                replaceKey={replaceKey}
            />

            {qrUrl && (
                <MenuModal title="Kod QR lokacji" size="md" onClose={() => setQrUrl(null)}>
                    <div className="forge-menu-qr">
                        <img src={qrUrl} alt="Kod QR lokacji" width={200} height={200} />
                    </div>
                </MenuModal>
            )}
        </div>
    );
}
