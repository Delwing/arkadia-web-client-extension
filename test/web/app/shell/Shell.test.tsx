import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type Ref } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@web/layout', () => ({ LayoutManagerWrapper: () => <div id="fake-layout" /> }));
vi.mock('@web/commandInput/CommandLine.tsx', () => ({ default: () => <div id="input-area" /> }));
vi.mock('@web/auth/AuthOverlay.tsx', () => ({ AuthOverlay: () => <div id="auth-overlay" /> }));
vi.mock('@web-ui/footer/layout/StockFooter', () => ({ default: () => <div id="char-state" /> }));
vi.mock('@web/app/AppModals', () => ({ AppModals: () => <div id="settings-modal" /> }));
vi.mock('@web/app/shell/GameOutput', () => ({ GameOutput: () => <div id="main_text_output_msg_wrapper" /> }));
vi.mock('@web/app/shell/MapPane', () => ({
    MapPane: () => { throw new Error('map broke'); },
}));
vi.mock('@web/app/shell/RecordingStopButton', () => ({
    RecordingStopButton: ({ ref }: { ref?: Ref<HTMLButtonElement> }) => <button id="recording-button" ref={ref} />,
}));
vi.mock('@web/app/shell/contentAreaFocus', () => ({ installContentAreaFocus: vi.fn() }));
vi.mock('@web/app/shell/CompassRose', () => ({ CompassRose: () => <div id="compass-rose-box" /> }));
vi.mock('@web/app/LogsWindow', () => ({ LogsWindow: () => <div id="logs-modal" /> }));

import { Shell } from '@web/app/shell/Shell';
import { objectListHost, objectListOthersHost } from '@web/app/shell/mapHosts';

// React 19 requires this flag for act() outside a test framework integration.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Shell', () => {
    let container: HTMLElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.restoreAllMocks();
    });

    const render = () => act(() => root.render(
        <Shell commandLine={{} as any} auth={{} as any} toasts={null} mapLoad={{} as any} />,
    ));

    it('renders the page in the order the stylesheets know, with the object lists after the footer', () => {
        render();
        const main = document.getElementById('main-container')!;
        expect([...main.children].map(c => c.id)).toEqual([
            'content-area', 'footer-layout', 'objects-list', 'objects-list-others', 'recording-button',
            'content-width-measure', 'settings-modal', 'command-line-root',
            'layout-bottom-dock-host', 'layout-left-dock-host', 'layout-right-dock-host',
            'auth-overlay', 'logs-modal',
        ]);
        expect(objectListHost.element.parentElement).toBe(main);
        expect(objectListOthersHost.element.parentElement).toBe(main);
        expect(document.querySelector('#footer-layout #char-state')).not.toBeNull();
        expect(document.querySelector('#command-line-root #input-area')).not.toBeNull();
    });

    it('keeps the rest of the page when one region fails', () => {
        render();
        // MapPane throws in this test; the content area still has the rest.
        const content = document.getElementById('content-area')!;
        expect([...content.children].map(c => c.id)).toEqual(['layout-manager-root', 'main_text_output_msg_wrapper', 'compass-rose-box']);
        expect(console.error).toHaveBeenCalledWith('[app] MapPane failed to render', expect.any(Error));
    });
});
