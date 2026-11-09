import { createBrowserHost } from '@web/browserHost.ts';

describe('browser host', () => {
    const host = createBrowserHost();

    afterEach(() => {
        document.body.innerHTML = '';
    });

    function focus(html: string): void {
        document.body.innerHTML = html;
        (document.body.firstElementChild as HTMLElement).focus();
    }

    test('typing in a text field holds global keybinds', () => {
        focus('<input type="text">');
        expect(host.isTypingInTextField()).toBe(true);
        focus('<textarea></textarea>');
        expect(host.isTypingInTextField()).toBe(true);
    });

    test('the command line opts back in to global keybinds', () => {
        focus('<input type="text" data-command-input>');
        expect(host.isTypingInTextField()).toBe(false);
    });

    test('nothing focused is not typing', () => {
        expect(host.isTypingInTextField()).toBe(false);
    });

    test('onKeyDown delivers page key presses until unsubscribed', () => {
        const keys: string[] = [];
        const off = host.onKeyDown(ev => keys.push(ev.key));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
        off();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
        expect(keys).toEqual(['a']);
    });

    test('onUnload fires on beforeunload', () => {
        const listener = vi.fn();
        const off = host.onUnload(listener);
        window.dispatchEvent(new Event('beforeunload'));
        off();
        window.dispatchEvent(new Event('beforeunload'));
        expect(listener).toHaveBeenCalledTimes(1);
    });

    test('onStorageChange only reports its own key', () => {
        const listener = vi.fn();
        const off = host.onStorageChange('stored_scripts_updated', listener);
        window.dispatchEvent(new StorageEvent('storage', { key: 'other' }));
        window.dispatchEvent(new StorageEvent('storage', { key: 'stored_scripts_updated' }));
        off();
        expect(listener).toHaveBeenCalledTimes(1);
    });
});
