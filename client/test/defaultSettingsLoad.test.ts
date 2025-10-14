import storage, {getItemSync} from '../src/storage';
import {defaultSettings} from '../src/defaultSettings';

describe('default settings loading', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('returns defaults when no settings stored', async () => {
        const res = await storage.getItem('settings');
        expect(res).toEqual({...defaultSettings});
        expect(getItemSync('settings')).toEqual({...defaultSettings});
    });
});
