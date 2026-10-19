import { ToastStore } from '@web/notifications/toastStore';
import type { ToastSettings } from '@web/notifications/toastSettings';

const base: ToastSettings = {
    toastPosition: 'top-right',
    toastDurationScale: 1,
    toastMaxVisible: 4,
    toastMutedSources: [],
    toastDoNotDisturb: false,
};

function setup(overrides: Partial<ToastSettings> = {}) {
    const settings = { ...base, ...overrides };
    const store = new ToastStore(() => settings);
    const toasts = () => store.getSnapshot().toasts;
    return { store, settings, toasts };
}

describe('ToastStore', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('shows newest first and expires after its time', () => {
        const { store, toasts } = setup();
        store.show({ text: 'one', time: 1000 });
        store.show({ text: 'two', time: 5000 });
        expect(toasts().map(t => t.text)).toEqual(['two', 'one']);

        jest.advanceTimersByTime(1000);
        expect(toasts().map(t => t.text)).toEqual(['two']);
    });

    test('scales the time by the duration setting', () => {
        const { store, toasts } = setup({ toastDurationScale: 2 });
        store.show({ text: 'slow', time: 1000 });
        jest.advanceTimersByTime(1500);
        expect(toasts()).toHaveLength(1);
        jest.advanceTimersByTime(500);
        expect(toasts()).toHaveLength(0);
    });

    test('merges a repeat under the same key and counts it', () => {
        const { store, toasts } = setup();
        store.show({ text: 'delay 1', key: 'd', time: 1000 });
        jest.advanceTimersByTime(800);
        store.show({ text: 'delay 2', key: 'd', time: 1000 });

        expect(toasts()).toHaveLength(1);
        expect(toasts()[0]).toMatchObject({ text: 'delay 2', count: 2 });
        // The repeat restarted the timer.
        jest.advanceTimersByTime(800);
        expect(toasts()).toHaveLength(1);
    });

    test('an update changes the toast in place without counting', () => {
        const { store, toasts } = setup();
        store.show({ text: 'step 1', key: 'walk', sticky: true });
        store.show({ text: 'step 2', key: 'walk', sticky: true, update: true });
        expect(toasts()[0]).toMatchObject({ text: 'step 2', count: 1 });
    });

    test('an update for a closed toast does not bring it back', () => {
        const { store, toasts } = setup();
        store.show({ text: 'step 1', key: 'walk', sticky: true });
        store.dismissKey('walk');
        expect(store.show({ text: 'step 2', key: 'walk', update: true })).toBe(false);
        expect(toasts()).toHaveLength(0);
    });

    test('a sticky toast stays until it is released', () => {
        const { store, toasts } = setup();
        store.show({ text: 'walking', key: 'walk', sticky: true });
        jest.advanceTimersByTime(60_000);
        expect(toasts()).toHaveLength(1);

        store.show({ text: 'arrived', key: 'walk', update: true, time: 1000 });
        jest.advanceTimersByTime(1000);
        expect(toasts()).toHaveLength(0);
    });

    test('drops muted sources and, under do not disturb, all but warnings and errors', () => {
        const { store, toasts } = setup({ toastMutedSources: ['map'], toastDoNotDisturb: true });
        expect(store.show({ text: 'gps', source: 'map', level: 'warning' })).toBe(false);
        expect(store.show({ text: 'hp', source: 'client' })).toBe(false);
        expect(store.show({ text: 'conflict', source: 'sync', level: 'warning' })).toBe(true);
        expect(toasts().map(t => t.text)).toEqual(['conflict']);
    });

    test('hover holds every timer', () => {
        const { store, toasts } = setup();
        store.show({ text: 'read me', time: 1000 });
        jest.advanceTimersByTime(600);
        store.setPaused(true);
        jest.advanceTimersByTime(10_000);
        expect(toasts()).toHaveLength(1);

        store.setPaused(false);
        jest.advanceTimersByTime(399);
        expect(toasts()).toHaveLength(1);
        jest.advanceTimersByTime(1);
        expect(toasts()).toHaveLength(0);
    });

    test('toasts hidden behind the overflow pill do not expire', () => {
        const { store, toasts } = setup({ toastMaxVisible: 1 });
        store.show({ text: 'old', time: 1000 });
        store.show({ text: 'new', time: 5000 });
        jest.advanceTimersByTime(2000);
        expect(toasts().map(t => t.text)).toEqual(['new', 'old']);
    });

    test('a pinned toast no longer expires', () => {
        const { store, toasts } = setup();
        store.show({ text: 'keep', time: 1000 });
        store.pin(toasts()[0].id);
        jest.advanceTimersByTime(5000);
        expect(toasts()[0]).toMatchObject({ text: 'keep', sticky: true });
    });

    test('closing the last toast clears a hover pause', () => {
        const { store, toasts } = setup();
        store.show({ text: 'a', time: 1000 });
        store.setPaused(true);
        store.dismiss(toasts()[0].id);
        store.show({ text: 'b', time: 1000 });
        jest.advanceTimersByTime(1000);
        expect(toasts()).toHaveLength(0);
    });
});
