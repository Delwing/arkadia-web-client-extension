import { defaultSettings } from '@modules/core/defaultSettings';
import type { Settings } from '@modules/core/defaultSettings';
import { characterStorage } from '@modules/core/storage';

export function setTestSettings(overrides: Partial<Settings>) {
    characterStorage.set('settings', { ...defaultSettings, ...overrides });
}
