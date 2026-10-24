import { afterEach, describe, expect, test } from 'vitest';
import { getDownloadUrl, isHelperSupported } from '@web/helperDownload.ts';

const UA = {
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    android: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

const originals = {
    userAgent: Object.getOwnPropertyDescriptor(navigator, 'userAgent'),
    platform: Object.getOwnPropertyDescriptor(navigator, 'platform'),
    maxTouchPoints: Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints'),
};

function setDevice(userAgent: string, platform: string, maxTouchPoints = 0) {
    Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true });
    Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
}

/** The helper is desktop-only: phones and tablets get no mode, menu or download for it. */
describe('helper availability', () => {
    afterEach(() => {
        for (const [key, descriptor] of Object.entries(originals)) {
            if (descriptor) Object.defineProperty(navigator, key, descriptor);
            else delete (navigator as unknown as Record<string, unknown>)[key];
        }
    });

    test('desktops get their build', () => {
        setDevice(UA.windows, 'Win32');
        expect(isHelperSupported()).toBe(true);
        expect(getDownloadUrl()?.os).toBe('win');

        setDevice(UA.linux, 'Linux x86_64');
        expect(getDownloadUrl()?.os).toBe('linux');
    });

    test('a Mac with no touch screen is a Mac', () => {
        setDevice(UA.mac, 'MacIntel', 0);
        expect(isHelperSupported()).toBe(true);
        expect(getDownloadUrl()?.os).toBe('mac');
    });

    test('a Mac downloads a zip, since Safari would name the bare binary ".txt"', () => {
        setDevice(UA.mac, 'MacIntel', 0);
        const dl = getDownloadUrl();
        expect(dl?.url).toMatch(/\/arkadia-helper-darwin-(arm64|amd64)\.zip$/);
        expect(dl?.fileName).toMatch(/^arkadia-helper-darwin-(arm64|amd64)$/);
    });

    test('Android is not offered the Linux build', () => {
        setDevice(UA.android, 'Linux armv81', 5);
        expect(isHelperSupported()).toBe(false);
        expect(getDownloadUrl()).toBeNull();
    });

    test('iPhone gets nothing', () => {
        setDevice(UA.iphone, 'iPhone', 5);
        expect(isHelperSupported()).toBe(false);
        expect(getDownloadUrl()).toBeNull();
    });

    test('an iPad passing as a Mac is caught by its touch points', () => {
        setDevice(UA.mac, 'MacIntel', 5);
        expect(isHelperSupported()).toBe(false);
        expect(getDownloadUrl()).toBeNull();
    });
});
