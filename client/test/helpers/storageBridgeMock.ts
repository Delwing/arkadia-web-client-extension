import { defaultSettings } from '../../src/defaultSettings';
import type Client from '../../src/Client';
import type { ClientStorageBridge } from '../../src/state/storageBridge';

type Overrides = Partial<ClientStorageBridge>;

type Mutable<T> = {
    -readonly [K in keyof T]: T[K];
};

export function createStorageBridgeMock(overrides: Overrides = {}): ClientStorageBridge {
    const noop = () => {};
    const mock: Mutable<ClientStorageBridge> = {
        initialize: jest.fn().mockResolvedValue(undefined),
        bindClient: jest.fn().mockReturnValue(noop),
        getSettingsSnapshot: jest.fn(() => ({ ...defaultSettings })),
        loadCharacterScopedData: jest.fn().mockResolvedValue(undefined),
        loadScripts: jest.fn().mockResolvedValue(undefined),
        setItem: jest.fn().mockResolvedValue(undefined),
    };

    return Object.assign(mock, overrides);
}

export function createStorageBridgeWithHandlers(handlers: {
    onSetItem?: (key: string, value: unknown) => void;
    onLoad?: (keys: string[]) => void;
} = {}): ClientStorageBridge {
    return createStorageBridgeMock({
        setItem: jest.fn(async (key: string, value: unknown) => {
            handlers.onSetItem?.(key, value);
        }),
        loadCharacterScopedData: jest.fn(async (_client: Client, keys: string[]) => {
            handlers.onLoad?.(keys);
        }),
    });
}
