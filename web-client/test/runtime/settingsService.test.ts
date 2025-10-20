jest.mock('@client/src/storage', () => ({
    __esModule: true,
    default: {
        onChanged: {
            addListener: jest.fn(),
            removeListener: jest.fn(),
        },
    },
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
}));

import { defaultSettings } from '@client/src/defaultSettings';
import { SettingsService } from '../../src/runtime/settingsService';

describe('SettingsService', () => {
    test('onChange notifies listener immediately with current snapshot', () => {
        const initial = { ...defaultSettings, shortenExits: !defaultSettings.shortenExits };
        const service = new SettingsService(initial);
        const listener = jest.fn();

        service.onChange(listener);

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener.mock.calls[0][0]).toEqual(initial);
    });
});
