import { afterEach, describe, expect, test, vi } from 'vitest';
import {
    getConnectionView,
    requestReconnect,
    setConnectionOffline,
    setConnectionStatus,
    setReconnectHandler,
    subscribeConnectionView,
} from '@web/commandInput/connectionView.ts';

/** What main.ts tells the command line (and the ⋯ menu's status line) about the connection. */

afterEach(() => {
    setConnectionOffline(false);
    setConnectionStatus('disconnected', 'direct');
    setReconnectHandler(() => {});
});

describe('connectionView', () => {
    test('status and route are published together', () => {
        setConnectionStatus('connected', 'proxy');
        expect(getConnectionView()).toMatchObject({ status: 'connected', route: 'proxy' });
    });

    test('listeners hear only real changes', () => {
        setConnectionStatus('connecting', 'helper');
        const listener = vi.fn();
        const off = subscribeConnectionView(listener);
        setConnectionStatus('connecting', 'helper');
        setConnectionOffline(false);
        expect(listener).not.toHaveBeenCalled();
        setConnectionStatus('connected', 'helper');
        setConnectionOffline(true);
        expect(listener).toHaveBeenCalledTimes(2);
        off();
        setConnectionOffline(false);
        expect(listener).toHaveBeenCalledTimes(2);
    });

    test('going offline stamps the time and keeps the status; coming back clears it', () => {
        vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
        setConnectionStatus('disconnected', 'proxy');
        setConnectionOffline(true);
        expect(getConnectionView()).toEqual({
            offline: true, offlineSince: 1_700_000_000_000, status: 'disconnected', route: 'proxy',
        });
        setConnectionOffline(false);
        expect(getConnectionView().offlineSince).toBeNull();
        vi.restoreAllMocks();
    });

    test('a new snapshot on every change, so React re-renders', () => {
        const before = getConnectionView();
        setConnectionStatus('connected', 'direct');
        expect(getConnectionView()).not.toBe(before);
    });

    test('the reconnect button calls whatever main.ts handed over', () => {
        const handler = vi.fn();
        setReconnectHandler(handler);
        requestReconnect();
        expect(handler).toHaveBeenCalledOnce();
    });
});
