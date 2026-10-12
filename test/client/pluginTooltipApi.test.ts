import { PluginApiImpl } from '@client/PluginApi';
import { getUiPort, setUiPort } from '@client/ports';

describe('plugin tooltip API', () => {
    const original = getUiPort();
    const attached: { element: Element; card: unknown; removed: boolean }[] = [];

    beforeEach(() => {
        attached.length = 0;
        setUiPort({
            ...original,
            attachTooltip: (element, card) => {
                const entry = { element, card: card as unknown, removed: false };
                attached.push(entry);
                return { update: (next) => { entry.card = next; }, remove: () => { entry.removed = true; } };
            },
        });
    });

    afterEach(() => setUiPort(original));

    test('passes the card to the UI and follows updates', () => {
        const api = new PluginApiImpl({} as never, 'test/tooltip');
        const element = document.createElement('span');
        const tip = api.ui.setTooltip(element, { header: 'Cel' });
        tip.update('ork');
        expect(attached).toEqual([{ element, card: 'ork', removed: false }]);
    });

    test('unloading the plugin removes its tooltips', () => {
        const api = new PluginApiImpl({} as never, 'test/tooltip');
        api.ui.setTooltip(document.createElement('span'), 'a');
        api.ui.setTooltip(document.createElement('span'), 'b');
        api.cleanup();
        expect(attached.map((a) => a.removed)).toEqual([true, true]);
    });

    test('a UI without tooltips gives a handle that does nothing', () => {
        setUiPort({ ...original, attachTooltip: undefined });
        const api = new PluginApiImpl({} as never, 'test/tooltip');
        const tip = api.ui.setTooltip(document.createElement('span'), 'a');
        expect(() => { tip.update('b'); tip.remove(); }).not.toThrow();
    });
});
