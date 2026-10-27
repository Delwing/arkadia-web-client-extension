import { PluginApiImpl } from '@client/PluginApi';
import { getUiPort, setUiPort } from '@client/ports';

describe('plugin scrollback API', () => {
    const original = getUiPort();
    const attached: { element: HTMLElement; options: unknown; removed: boolean; refreshed: number }[] = [];

    beforeEach(() => {
        attached.length = 0;
        setUiPort({
            ...original,
            attachScrollback: (element, options) => {
                const entry = { element, options: options as unknown, removed: false, refreshed: 0 };
                attached.push(entry);
                return {
                    isSplitView: () => true,
                    refresh: () => { entry.refreshed++; },
                    setSplitHeight: () => {},
                    scrollToBottom: () => {},
                    remove: () => { entry.removed = true; },
                };
            },
        });
    });

    afterEach(() => setUiPort(original));

    test('hands the element and options to the UI', () => {
        const api = new PluginApiImpl({} as never, 'test/scrollback');
        const element = document.createElement('div');
        const scrollback = api.ui.attachScrollback(element, { splitLines: 5 });
        scrollback.refresh();
        expect(scrollback.isSplitView()).toBe(true);
        expect(attached).toEqual([{ element, options: { splitLines: 5 }, removed: false, refreshed: 1 }]);
    });

    test('unloading the plugin detaches its scrollbacks', () => {
        const api = new PluginApiImpl({} as never, 'test/scrollback');
        api.ui.attachScrollback(document.createElement('div'));
        api.ui.attachScrollback(document.createElement('div'));
        api.cleanup();
        expect(attached.map((a) => a.removed)).toEqual([true, true]);
    });

    test('a UI without scrollbacks gives a handle that does nothing', () => {
        setUiPort({ ...original, attachScrollback: undefined });
        const api = new PluginApiImpl({} as never, 'test/scrollback');
        const scrollback = api.ui.attachScrollback(document.createElement('div'));
        expect(scrollback.isSplitView()).toBe(false);
        expect(() => { scrollback.refresh(); scrollback.scrollToBottom(); scrollback.remove(); }).not.toThrow();
    });
});
