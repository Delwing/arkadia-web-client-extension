import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@web/hostProxy/ProxyControls', () => ({
    ProxyControls: (props: { onBlockedChange: (b: boolean) => void; onModeChange: (m: string) => void }) => (
        <div id="fake-proxy-controls">
            <button id="fake-block" onClick={() => props.onBlockedChange(true)} />
            <button id="fake-direct" onClick={() => props.onModeChange('direct')} />
        </div>
    ),
}));
vi.mock('@web/account/AccountScreen', () => ({ AccountScreen: () => null }));
vi.mock('@web/auth/CommitInfo', () => ({ CommitInfo: () => <div id="commit-info" /> }));

import { AuthOverlay } from '@web/auth/AuthOverlay';
import { AppProviders } from '@web/app/AppProviders';
import type { AppServices } from '@web/app/appServices';
import type { ConnectionControllerState } from '@web/connection/connectionController';

// React 19 requires this flag for act() outside a test framework integration.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeStore<T>(initial: T) {
    let state = initial;
    const listeners = new Set<() => void>();
    return {
        getState: () => state,
        subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
        set(patch: Partial<T>) { state = { ...state, ...patch }; listeners.forEach(fn => fn()); },
    };
}

function makeServices() {
    const connectionStore = makeStore<ConnectionControllerState>({
        connected: false, connecting: false, disconnecting: false, authClosed: false,
        playback: false, accountLeaving: false, loginNotice: null,
    });
    const connection = {
        ...connectionStore,
        signIn: vi.fn(),
        toggle: vi.fn(),
        closeAuth: vi.fn(() => connectionStore.set({ authClosed: true })),
        clearLoginNotice: vi.fn(),
    };
    const accountStore = makeStore({ view: 'off', loggingIn: false });
    const accountSession = {
        ...accountStore,
        isActive: () => false,
        login: vi.fn(),
        openCreateAccount: vi.fn(),
    };
    const client = { enableNotifications: vi.fn(), sendEvent: vi.fn() };
    return {
        connection, accountSession, client,
        services: { client, connection, accountSession, helperConnection: {} } as unknown as AppServices,
    };
}

const proxyControls = {
    defaultProxy: '', initialResumeNotice: false, onResumeNoticeChange: vi.fn(), initialMode: 'proxy' as const,
    initialUrl: '', onModeChange: vi.fn(), onUrlChange: vi.fn(), onUseProxy: vi.fn(), initialMccp: false,
    onMccpChange: vi.fn(), helper: {} as never, onHelperHelp: vi.fn(),
};

describe('AuthOverlay', () => {
    let host: HTMLElement;
    let root: Root;
    let fx: ReturnType<typeof makeServices>;
    let proxyMode: 'direct' | 'helper' | 'proxy';
    const onDismissed = vi.fn();

    const render = () => act(() => root.render(
        <AppProviders services={fx.services}>
            <AuthOverlay proxyControls={proxyControls} getProxyMode={() => proxyMode} onDismissed={onDismissed} />
        </AppProviders>,
    ));
    const $ = <T extends HTMLElement>(sel: string) => host.querySelector<T>(sel)!;
    const submit = () => act(() => { $('#login-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    const type = (sel: string, value: string) => { $<HTMLInputElement>(sel).value = value; };

    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        fx = makeServices();
        proxyMode = 'proxy';
        onDismissed.mockClear();
        render();
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
        document.body.classList.remove('auth-open');
    });

    it('shows while offline and hides once connected', () => {
        expect($('#auth-overlay').style.display).toBe('flex');
        expect(document.body.classList.contains('auth-open')).toBe(true);
        act(() => fx.connection.set({ connected: true }));
        expect($('#auth-overlay').style.display).toBe('none');
        expect(document.body.classList.contains('auth-open')).toBe(false);
    });

    it('stays hidden during playback', () => {
        act(() => fx.connection.set({ playback: true }));
        expect($('#auth-overlay').style.display).toBe('none');
    });

    it('marks the panel while connecting', () => {
        act(() => fx.connection.set({ connecting: true }));
        expect($('#auth-panel').classList.contains('is-connecting')).toBe(true);
    });

    it('signs in with a character name', () => {
        type('#login-character', 'Gerwazy');
        type('#login-password', 'Sekret');
        submit();
        expect(fx.connection.signIn).toHaveBeenCalledWith({ character: 'Gerwazy', password: 'Sekret' });
        expect(fx.accountSession.login).not.toHaveBeenCalled();
    });

    it('opens the account for an e-mail on the direct connection only', () => {
        type('#login-character', ' gracz@example.com ');
        type('#login-password', 'x');
        submit();
        expect(fx.connection.signIn).toHaveBeenCalledTimes(1);

        proxyMode = 'direct';
        submit();
        expect(fx.accountSession.login).toHaveBeenCalledWith('gracz@example.com', 'x');
        expect(fx.connection.clearLoginNotice).toHaveBeenCalled();
    });

    it("shows the game's login message and clears the password when it is about the password", () => {
        type('#login-password', 'zle');
        act(() => fx.connection.set({ loginNotice: 'Bledne haslo.' }));
        expect($('#system-login-message').textContent).toContain('Bledne haslo.');
        expect($('#auth-panel').classList.contains('has-password-error')).toBe(true);
        expect($<HTMLInputElement>('#login-password').value).toBe('');
        expect($<HTMLInputElement>('#login-password').placeholder).toBe('Wpisz ponownie');

        act(() => fx.connection.set({ connecting: true }));
        expect($('#system-login-message').textContent).toBe('');
    });

    it('the eye shows the password, and submitting hides it again', () => {
        act(() => $('#login-password-toggle').click());
        expect($('#login-password').getAttribute('type')).toBe('text');
        expect($('#login-password-toggle').title).toBe('Ukryj hasło');
        submit();
        expect($('#login-password').getAttribute('type')).toBe('password');
    });

    it('dismisses on the close button and on Escape', () => {
        act(() => $('#auth-close').click());
        expect(fx.connection.closeAuth).toHaveBeenCalledTimes(1);
        expect(onDismissed).toHaveBeenCalledTimes(1);
        expect($('#auth-overlay').style.display).toBe('none');

        act(() => fx.connection.set({ authClosed: false }));
        act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
        expect(fx.connection.closeAuth).toHaveBeenCalledTimes(2);
    });

    it('connects without logging in, and opens account creation', () => {
        act(() => $('#connect-button').click());
        expect(fx.connection.toggle).toHaveBeenCalledTimes(1);
        act(() => $('#create-account-link').click());
        expect(fx.accountSession.openCreateAccount).toHaveBeenCalledTimes(1);
    });

    it('follows the connection footer: blocked state, mode, and the fold', () => {
        act(() => $('#fake-block').click());
        expect($('#auth-panel').classList.contains('is-blocked')).toBe(true);
        act(() => $('#fake-direct').click());
        expect($('#auth-panel').classList.contains('is-direct')).toBe(true);
        expect(proxyControls.onModeChange).toHaveBeenCalledWith('direct');

        act(() => $('#auth-conn-fold').click());
        expect($('#auth-conn-fold').classList.contains('is-open')).toBe(true);
        expect($('#proxy-controls-root').classList.contains('is-open')).toBe(true);
    });

    it('renders the forge and the password mask', () => {
        expect(host.querySelectorAll('.auth-embers .auth-ember').length).toBeGreaterThanOrEqual(24);
        expect(host.querySelector('.auth-pass .auth-mask')).not.toBeNull();
    });
});
