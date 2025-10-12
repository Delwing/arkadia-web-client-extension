import { LocalStorageSettingsService } from '../../src/runtime/settings/local-storage-service';
import { settingsEventHub, type SettingsSnapshot } from '../../src/runtime/settings/settings-service';
import { setCurrentCharacter } from '../../src/storage';
import { defaultSettings } from '../../src/defaultSettings';

describe('LocalStorageSettingsService', () => {
    let service: LocalStorageSettingsService | null = null;

    beforeEach(() => {
        localStorage.clear();
        setCurrentCharacter('');
    });

    afterEach(() => {
        service?.destroy();
        service = null;
        localStorage.clear();
        setCurrentCharacter('');
    });

    function createService() {
        service?.destroy();
        service = new LocalStorageSettingsService();
        return service;
    }

    test('persists updates to storage', async () => {
        const svc = createService();
        await svc.update({ language: 'elficki' } as Partial<SettingsSnapshot>);
        const raw = localStorage.getItem('settings');
        expect(raw).not.toBeNull();
        const stored = JSON.parse(raw as string);
        expect(stored.language).toBe('elficki');
        expect(stored.packageHelper).toBe(defaultSettings.packageHelper);
    });

    test('emits reactive updates and notifies the event hub', async () => {
        const svc = createService();
        const observed: string[] = [];
        const subscription = svc.settings$.subscribe(snapshot => {
            observed.push(String(snapshot.language));
        });
        const hubUpdates: SettingsSnapshot[] = [];
        const hubSubscription = settingsEventHub.on('settings.updated', (snapshot) => {
            hubUpdates.push(snapshot);
        });

        await svc.update({ language: 'elficki' } as Partial<SettingsSnapshot>);
        await svc.update({ language: 'khazalid' } as Partial<SettingsSnapshot>);

        expect(observed.slice(-2)).toEqual(['elficki', 'khazalid']);
        expect(hubUpdates.slice(-2).map(s => s.language)).toEqual(['elficki', 'khazalid']);

        subscription.unsubscribe();
        hubSubscription.unsubscribe();
    });

    test('reloads scoped settings when the active character changes', async () => {
        setCurrentCharacter('Alice');
        const svc = createService();
        const snapshots: SettingsSnapshot[] = [];
        const subscription = svc.settings$.subscribe(snapshot => {
            snapshots.push(snapshot);
        });

        await svc.update({ language: 'elficki' } as Partial<SettingsSnapshot>);
        const aliceRaw = localStorage.getItem('Alice:settings');
        expect(aliceRaw).not.toBeNull();

        localStorage.setItem('Bob:settings', JSON.stringify({
            ...defaultSettings,
            language: 'khazalid',
        }));

        setCurrentCharacter('Bob');
        await Promise.resolve();

        expect(snapshots.at(-1)?.language).toBe('khazalid');
        subscription.unsubscribe();
    });
});
