import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { AppModalShell } from '@web/modals/AppModalShell';
import { AppModal, MODAL_EVENT, prepareModal } from '@web/modals/appModal';

// React 19 requires this flag for act() outside a test framework integration.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('AppModalShell', () => {
    let host: HTMLElement;
    let root: Root;

    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
    });

    it('renders the app-modal markup the controller and styles expect', () => {
        act(() => root.render(
            <AppModalShell id="demo-modal" title="Demo" dialogClassName="app-modal__dialog--lg" bodyClassName="app-modal__body--flush">
                <p>body</p>
            </AppModalShell>,
        ));
        expect(host.innerHTML).toBe(
            '<div id="demo-modal" class="app-modal" hidden="">'
            + '<div class="app-modal__dialog app-modal__dialog--lg" tabindex="-1">'
            + '<div class="app-modal__header"><h2 class="app-modal__title">Demo</h2>'
            + '<button type="button" class="app-modal__close" data-modal-dismiss="" title="Zamknij">×</button></div>'
            + '<div class="app-modal__body app-modal__body--flush"></div>'
            + '</div></div>',
        );
    });

    it('mounts the content on first use, before the window opens, and keeps it', () => {
        const seen: string[] = [];
        // A content that refreshes on its window's show, as Klawisze or Miejsca do.
        const Content = () => {
            useEffect(() => {
                const modal = document.getElementById('demo-modal')!;
                const onShow = () => seen.push('show');
                modal.addEventListener(MODAL_EVENT.show, onShow);
                return () => modal.removeEventListener(MODAL_EVENT.show, onShow);
            }, []);
            return <p id="demo-content">body</p>;
        };
        act(() => root.render(<AppModalShell id="demo-modal" title="Demo"><Content /></AppModalShell>));
        expect(document.getElementById('demo-content')).toBeNull();

        const modal = AppModal.byId('demo-modal')!;
        modal.show();
        expect(document.getElementById('demo-content')).not.toBeNull();
        expect(seen).toEqual(['show']);

        modal.hide();
        expect(document.getElementById('demo-content')).not.toBeNull();
    });

    it('mounts the content without opening when prepared', () => {
        act(() => root.render(<AppModalShell id="demo-modal" title="Demo"><p id="demo-content">body</p></AppModalShell>));
        prepareModal(document.getElementById('demo-modal')!);
        expect(document.getElementById('demo-content')).not.toBeNull();
        expect(document.getElementById('demo-modal')!.hidden).toBe(true);
    });

    it('renders header actions, a header slot and a footer when given', () => {
        let slot: HTMLDivElement | null = null;
        act(() => root.render(
            <AppModalShell
                id="demo-modal"
                title="Demo"
                headerActions={<button id="extra">x</button>}
                headerSlot={{ id: 'demo-header-slot', ref: (el) => { slot = el; } }}
                footer={<button id="save">Zapisz</button>}
            >
                body
            </AppModalShell>,
        ));
        expect(slot).toBe(document.getElementById('demo-header-slot'));
        const header = host.querySelector('.app-modal__header')!;
        expect([...header.children].map(c => c.id || c.className)).toEqual(['app-modal__title', 'demo-header-slot', 'extra', 'app-modal__close']);
        expect(host.querySelector('.app-modal__footer #save')).not.toBeNull();
    });

    it('stays open across a re-render once the controller has shown it', () => {
        const render = (title: string) => act(() => root.render(<AppModalShell id="demo-modal" title={title}>body</AppModalShell>));
        render('Demo');
        const modal = AppModal.byId('demo-modal')!;
        modal.show();
        render('Demo 2');
        expect(document.getElementById('demo-modal')!.hidden).toBe(false);
        modal.hide();
        expect(document.getElementById('demo-modal')!.hidden).toBe(true);
    });

    it('lets content inside take Escape first, and closes on an Escape it leaves alone', () => {
        // The shell portalled the way the app does it, so React handles events above the modal.
        const portalTarget = document.createElement('div');
        document.body.appendChild(portalTarget);
        const SearchBox = () => (
            <input id="demo-search" onKeyDown={(e) => { if (e.currentTarget.value) { e.currentTarget.value = ''; e.preventDefault(); } }} />
        );
        act(() => root.render(createPortal(<AppModalShell id="demo-modal" title="Demo"><SearchBox /></AppModalShell>, portalTarget)));
        const modal = AppModal.byId('demo-modal')!;
        act(() => modal.show());
        const input = document.getElementById('demo-search') as HTMLInputElement;
        const escape = () => act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });

        input.value = 'mapa';
        escape();
        expect(input.value).toBe('');
        expect(modal.isOpen).toBe(true);

        escape();
        expect(modal.isOpen).toBe(false);
        portalTarget.remove();
    });
});
