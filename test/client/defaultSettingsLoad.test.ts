import storage, { getItemSync } from '@modules/core/storage';
import { defaultSettings } from '@modules/core/defaultSettings';

describe('default settings loading', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('returns defaults when no settings stored', async () => {
    const res = await storage.getItem('settings');
    expect(res).toEqual({ settings: { ...defaultSettings } });
    expect(getItemSync('settings')).toEqual({ settings: { ...defaultSettings } });
  });
});
