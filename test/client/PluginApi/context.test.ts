import { createPluginApiContext } from '@client/PluginApi/context';
import { PluginApiImpl } from '@client/PluginApi';

describe('plugin API context', () => {
    test('names the plugin by its id until it reports a name', () => {
        const { context, setName } = createPluginApiContext({} as never, 'https://example.com/jubiler.js', 'jubiler');
        const renamed = jest.fn();
        context.onRename(renamed);

        expect(context.pluginName).toBeUndefined();
        expect(context.displayName).toBe('https://example.com/jubiler.js');
        expect(context.stateKey).toBe('jubiler');

        setName('Jubiler');
        expect(context.pluginName).toBe('Jubiler');
        expect(context.displayName).toBe('Jubiler');
        expect(renamed).toHaveBeenCalledWith('Jubiler');
    });

    test('cleanup runs every domain cleanup and tracked unsubscribe once', () => {
        const { context, cleanup } = createPluginApiContext({} as never, 'p', 'p');
        const first = jest.fn();
        const second = jest.fn();
        const unsubscribe = jest.fn();
        context.onCleanup(first);
        context.onCleanup(second);
        expect(context.track(unsubscribe)).toBe(unsubscribe);

        cleanup();
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);
        expect(unsubscribe).toHaveBeenCalledTimes(1);

        cleanup();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});

describe('plugin command API cleanup', () => {
    function fakeClient() {
        const hooks = new Map<string, unknown>();
        return {
            commandLineSuggestions: ['zabij'] as string[],
            registerCommandHook: jest.fn((id: string, callback: unknown) => { hooks.set(id, callback); }),
            unregisterCommandHook: jest.fn((id: string) => hooks.delete(id)),
            hooks,
        };
    }

    test('takes back its suggestions and command hooks, and leaves the rest', () => {
        const client = fakeClient();
        const api = new PluginApiImpl(client as never, 'jubiler');

        api.command.addSuggestions('wycen', 'sprzedaj');
        api.commandHooks.register(() => undefined);
        expect(client.commandLineSuggestions).toEqual(['zabij', 'wycen', 'sprzedaj']);
        expect(client.hooks.size).toBe(1);

        api.cleanup();
        expect(client.commandLineSuggestions).toEqual(['zabij']);
        expect(client.hooks.size).toBe(0);
    });
});
