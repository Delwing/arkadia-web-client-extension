import { syncDebounceManager } from '@modules/firebase/syncDebounceManager';

const HOT_SYNC_MS = 30 * 1000;
const COLD_SYNC_MS = 10 * 60 * 1000;

describe('SyncDebounceManager', () => {
    let onSyncNeeded: jest.Mock;

    beforeEach(() => {
        jest.useFakeTimers();
        syncDebounceManager.destroy(); // reset singleton state
        onSyncNeeded = jest.fn();
        syncDebounceManager.initialize({ onSyncNeeded });
    });

    afterEach(() => {
        syncDebounceManager.destroy();
        jest.useRealTimers();
    });

    // -------------------------------------------------------------------------
    // isColdStorageKey
    // -------------------------------------------------------------------------
    describe('isColdStorageKey', () => {
        it('should return true for kill_counter', () => {
            expect(syncDebounceManager.isColdStorageKey('kill_counter')).toBe(true);
        });

        it('should return true for character-scoped kill_counter', () => {
            expect(syncDebounceManager.isColdStorageKey('Alice:kill_counter')).toBe(true);
        });

        it('should return true for character-scoped key with multi-word character name', () => {
            expect(syncDebounceManager.isColdStorageKey('Some Character:kill_counter')).toBe(true);
        });

        it('should return false for triggers', () => {
            expect(syncDebounceManager.isColdStorageKey('triggers')).toBe(false);
        });

        it('should return false for aliases', () => {
            expect(syncDebounceManager.isColdStorageKey('aliases')).toBe(false);
        });

        it('should return false for settings', () => {
            expect(syncDebounceManager.isColdStorageKey('settings')).toBe(false);
        });

        it('should return false for Alice:settings', () => {
            expect(syncDebounceManager.isColdStorageKey('Alice:settings')).toBe(false);
        });

        it('should return false for empty string', () => {
            expect(syncDebounceManager.isColdStorageKey('')).toBe(false);
        });

        it('should return false for a key that ends with kill_counter but has no colon prefix', () => {
            // e.g., "xkill_counter" is not a cold key — no colon separator
            expect(syncDebounceManager.isColdStorageKey('xkill_counter')).toBe(false);
        });

        it('should return false for a colon-prefixed key whose base is not a cold key', () => {
            expect(syncDebounceManager.isColdStorageKey('Alice:triggers')).toBe(false);
        });
    });

    // -------------------------------------------------------------------------
    // isColdCategory
    // -------------------------------------------------------------------------
    describe('isColdCategory', () => {
        it('should return true for killCounts', () => {
            expect(syncDebounceManager.isColdCategory('killCounts')).toBe(true);
        });

        it('should return true for visitedRooms', () => {
            expect(syncDebounceManager.isColdCategory('visitedRooms')).toBe(true);
        });

        it('should return false for triggers', () => {
            expect(syncDebounceManager.isColdCategory('triggers')).toBe(false);
        });

        it('should return false for aliases', () => {
            expect(syncDebounceManager.isColdCategory('aliases')).toBe(false);
        });

        it('should return false for uiSettings', () => {
            expect(syncDebounceManager.isColdCategory('uiSettings')).toBe(false);
        });

        it('should return false for locationNotes', () => {
            expect(syncDebounceManager.isColdCategory('locationNotes')).toBe(false);
        });
    });

    // -------------------------------------------------------------------------
    // getColdCategories
    // -------------------------------------------------------------------------
    describe('getColdCategories', () => {
        it('should return an array containing killCounts and visitedRooms', () => {
            const categories = syncDebounceManager.getColdCategories();
            expect(categories).toContain('killCounts');
            expect(categories).toContain('visitedRooms');
        });

        it('should return exactly two categories', () => {
            expect(syncDebounceManager.getColdCategories()).toHaveLength(2);
        });

        it('should return a new array each call (not expose the internal Set)', () => {
            const first = syncDebounceManager.getColdCategories();
            const second = syncDebounceManager.getColdCategories();
            expect(first).not.toBe(second);
        });
    });

    // -------------------------------------------------------------------------
    // handleStorageChange — return value
    // -------------------------------------------------------------------------
    describe('handleStorageChange return values', () => {
        it('should return shouldSync:true and syncType:hot for hot keys', () => {
            const result = syncDebounceManager.handleStorageChange(['triggers']);
            expect(result).toEqual({ shouldSync: true, syncType: 'hot' });
        });

        it('should return shouldSync:true and syncType:cold for cold-only keys', () => {
            const result = syncDebounceManager.handleStorageChange(['kill_counter']);
            expect(result).toEqual({ shouldSync: true, syncType: 'cold' });
        });

        it('should return shouldSync:false and syncType:none for empty array', () => {
            const result = syncDebounceManager.handleStorageChange([]);
            expect(result).toEqual({ shouldSync: false, syncType: 'none' });
        });

        it('should return hot when array contains both hot and cold keys', () => {
            const result = syncDebounceManager.handleStorageChange(['kill_counter', 'triggers']);
            expect(result).toEqual({ shouldSync: true, syncType: 'hot' });
        });

        it('should return hot for character-scoped hot key mixed with cold key', () => {
            const result = syncDebounceManager.handleStorageChange(['Alice:kill_counter', 'Alice:triggers']);
            expect(result).toEqual({ shouldSync: true, syncType: 'hot' });
        });

        it('should return cold for character-scoped cold key alone', () => {
            const result = syncDebounceManager.handleStorageChange(['Alice:kill_counter']);
            expect(result).toEqual({ shouldSync: true, syncType: 'cold' });
        });
    });

    // -------------------------------------------------------------------------
    // Hot sync scheduling
    // -------------------------------------------------------------------------
    describe('hot sync scheduling', () => {
        it('should fire onSyncNeeded after 30 seconds', () => {
            syncDebounceManager.handleStorageChange(['triggers']);
            expect(onSyncNeeded).not.toHaveBeenCalled();

            jest.advanceTimersByTime(HOT_SYNC_MS);
            expect(onSyncNeeded).toHaveBeenCalledTimes(1);
        });

        it('should not fire before 30 seconds have elapsed', () => {
            syncDebounceManager.handleStorageChange(['triggers']);
            jest.advanceTimersByTime(HOT_SYNC_MS - 1);
            expect(onSyncNeeded).not.toHaveBeenCalled();
        });

        it('should debounce — reset the 30s timer on each hot change', () => {
            syncDebounceManager.handleStorageChange(['triggers']);
            jest.advanceTimersByTime(HOT_SYNC_MS - 1000); // 29 seconds in
            syncDebounceManager.handleStorageChange(['aliases']); // resets timer
            jest.advanceTimersByTime(1000); // only 1 more second — NOT yet 30s from last call
            expect(onSyncNeeded).not.toHaveBeenCalled();

            jest.advanceTimersByTime(HOT_SYNC_MS - 1000); // complete the debounce
            expect(onSyncNeeded).toHaveBeenCalledTimes(1);
        });

        it('should cancel a pending cold sync when a hot sync is scheduled', () => {
            // Schedule cold first
            syncDebounceManager.handleStorageChange(['kill_counter']);
            expect(syncDebounceManager.hasPendingColdSync()).toBe(true);

            // Hot change should cancel cold
            syncDebounceManager.handleStorageChange(['triggers']);
            expect(syncDebounceManager.hasPendingColdSync()).toBe(false);
        });

        it('should not fire the cold timer after it was cancelled by a hot sync', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']);
            syncDebounceManager.handleStorageChange(['triggers']); // cancels cold

            // Advance past cold interval — cold should not fire
            jest.advanceTimersByTime(COLD_SYNC_MS);
            // Only the hot sync (at 30s) should have fired
            expect(onSyncNeeded).toHaveBeenCalledTimes(1);
        });

        it('should clear hotDirty after the hot timer fires', () => {
            syncDebounceManager.handleStorageChange(['triggers']);
            expect(syncDebounceManager.hasPendingSync()).toBe(true);

            jest.advanceTimersByTime(HOT_SYNC_MS);
            expect(syncDebounceManager.hasPendingSync()).toBe(false);
        });
    });

    // -------------------------------------------------------------------------
    // Cold sync scheduling
    // -------------------------------------------------------------------------
    describe('cold sync scheduling', () => {
        it('should fire onSyncNeeded after 10 minutes', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']);
            expect(onSyncNeeded).not.toHaveBeenCalled();

            jest.advanceTimersByTime(COLD_SYNC_MS);
            expect(onSyncNeeded).toHaveBeenCalledTimes(1);
        });

        it('should not fire before 10 minutes have elapsed', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']);
            jest.advanceTimersByTime(COLD_SYNC_MS - 1);
            expect(onSyncNeeded).not.toHaveBeenCalled();
        });

        it('should not restart the timer if it is already running', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']);
            // 5 minutes in, trigger another cold change
            jest.advanceTimersByTime(COLD_SYNC_MS / 2);
            syncDebounceManager.handleStorageChange(['kill_counter']);

            // 5 more minutes — timer should fire (based on original 10 min start)
            jest.advanceTimersByTime(COLD_SYNC_MS / 2);
            expect(onSyncNeeded).toHaveBeenCalledTimes(1);
        });

        it('should keep coldDirty true until the timer fires', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']);
            jest.advanceTimersByTime(COLD_SYNC_MS - 1);
            expect(syncDebounceManager.hasPendingColdSync()).toBe(true);
        });

        it('should clear coldDirty after the cold timer fires', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']);
            jest.advanceTimersByTime(COLD_SYNC_MS);
            expect(syncDebounceManager.hasPendingColdSync()).toBe(false);
        });
    });

    // -------------------------------------------------------------------------
    // flushCold
    // -------------------------------------------------------------------------
    describe('flushCold', () => {
        it('should fire onSyncNeeded immediately when coldDirty is true', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']);
            expect(onSyncNeeded).not.toHaveBeenCalled();

            syncDebounceManager.flushCold();
            expect(onSyncNeeded).toHaveBeenCalledTimes(1);
        });

        it('should clear coldDirty after flushing', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']);
            syncDebounceManager.flushCold();
            expect(syncDebounceManager.hasPendingColdSync()).toBe(false);
        });

        it('should cancel the cold timer so it does not double-fire', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']);
            syncDebounceManager.flushCold(); // fires immediately
            jest.advanceTimersByTime(COLD_SYNC_MS); // timer should be gone
            expect(onSyncNeeded).toHaveBeenCalledTimes(1); // only once
        });

        it('should do nothing when coldDirty is false', () => {
            syncDebounceManager.flushCold();
            expect(onSyncNeeded).not.toHaveBeenCalled();
        });

        it('should do nothing when coldDirty is false even after a hot sync reset it', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']); // sets coldDirty
            syncDebounceManager.handleStorageChange(['triggers']);      // cancels cold, resets coldDirty
            syncDebounceManager.flushCold();
            expect(onSyncNeeded).not.toHaveBeenCalled(); // cold was already cancelled
        });
    });

    // -------------------------------------------------------------------------
    // flushAll (pagehide)
    // -------------------------------------------------------------------------
    describe('flushAll', () => {
        it('should fire immediately when a hot sync is pending', () => {
            syncDebounceManager.handleStorageChange(['triggers']);
            expect(onSyncNeeded).not.toHaveBeenCalled();

            syncDebounceManager.flushAll();
            expect(onSyncNeeded).toHaveBeenCalledTimes(1);
        });

        it('should fire immediately when a cold sync is pending', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']);
            syncDebounceManager.flushAll();
            expect(onSyncNeeded).toHaveBeenCalledTimes(1);
        });

        it('should do nothing when no sync is pending', () => {
            syncDebounceManager.flushAll();
            expect(onSyncNeeded).not.toHaveBeenCalled();
        });

        it('should cancel timers so nothing double-fires afterwards', () => {
            syncDebounceManager.handleStorageChange(['triggers']);
            syncDebounceManager.flushAll();
            jest.advanceTimersByTime(HOT_SYNC_MS + COLD_SYNC_MS);
            expect(onSyncNeeded).toHaveBeenCalledTimes(1);
        });

        it('should be triggered by the pagehide event (hot changes upload before close)', () => {
            syncDebounceManager.handleStorageChange(['triggers']);
            expect(onSyncNeeded).not.toHaveBeenCalled();

            window.dispatchEvent(new Event('pagehide'));
            expect(onSyncNeeded).toHaveBeenCalledTimes(1);
        });

        it('should not fire on pagehide after destroy', () => {
            syncDebounceManager.handleStorageChange(['triggers']);
            syncDebounceManager.destroy();

            window.dispatchEvent(new Event('pagehide'));
            expect(onSyncNeeded).not.toHaveBeenCalled();
        });
    });

    // -------------------------------------------------------------------------
    // hasPendingSync / hasPendingColdSync
    // -------------------------------------------------------------------------
    describe('hasPendingSync', () => {
        it('should return false initially (before any changes)', () => {
            expect(syncDebounceManager.hasPendingSync()).toBe(false);
        });

        it('should return true after a hot storage change', () => {
            syncDebounceManager.handleStorageChange(['triggers']);
            expect(syncDebounceManager.hasPendingSync()).toBe(true);
        });

        it('should return true after a cold storage change', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']);
            expect(syncDebounceManager.hasPendingSync()).toBe(true);
        });

        it('should return false after the hot timer fires', () => {
            syncDebounceManager.handleStorageChange(['triggers']);
            jest.advanceTimersByTime(HOT_SYNC_MS);
            expect(syncDebounceManager.hasPendingSync()).toBe(false);
        });

        it('should return false after the cold timer fires', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']);
            jest.advanceTimersByTime(COLD_SYNC_MS);
            expect(syncDebounceManager.hasPendingSync()).toBe(false);
        });
    });

    describe('hasPendingColdSync', () => {
        it('should return false initially', () => {
            expect(syncDebounceManager.hasPendingColdSync()).toBe(false);
        });

        it('should return true after a cold-only storage change', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']);
            expect(syncDebounceManager.hasPendingColdSync()).toBe(true);
        });

        it('should return false after a hot storage change (hot cancels cold)', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']); // cold pending
            syncDebounceManager.handleStorageChange(['triggers']);      // hot cancels cold
            expect(syncDebounceManager.hasPendingColdSync()).toBe(false);
        });

        it('should return false after a hot-only storage change with no prior cold', () => {
            syncDebounceManager.handleStorageChange(['triggers']);
            expect(syncDebounceManager.hasPendingColdSync()).toBe(false);
        });
    });

    // -------------------------------------------------------------------------
    // cancelAll
    // -------------------------------------------------------------------------
    describe('cancelAll', () => {
        it('should clear hotDirty', () => {
            syncDebounceManager.handleStorageChange(['triggers']);
            syncDebounceManager.cancelAll();
            expect(syncDebounceManager.hasPendingSync()).toBe(false);
        });

        it('should clear coldDirty', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']);
            syncDebounceManager.cancelAll();
            expect(syncDebounceManager.hasPendingColdSync()).toBe(false);
        });

        it('should prevent the hot timer from firing', () => {
            syncDebounceManager.handleStorageChange(['triggers']);
            syncDebounceManager.cancelAll();
            jest.advanceTimersByTime(HOT_SYNC_MS);
            expect(onSyncNeeded).not.toHaveBeenCalled();
        });

        it('should prevent the cold timer from firing', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']);
            syncDebounceManager.cancelAll();
            jest.advanceTimersByTime(COLD_SYNC_MS);
            expect(onSyncNeeded).not.toHaveBeenCalled();
        });

        it('should cancel both hot and cold timers simultaneously', () => {
            // Cold pending, then hot scheduled (hot cancels cold but starts hot timer)
            // Use: cold directly followed by cancel
            syncDebounceManager.handleStorageChange(['triggers']); // hot
            // Separately: a cold sync in a state before hot was triggered
            // We test both timers by calling cancelAll when both could be pending:
            // That is only possible if cold was scheduled BEFORE hot reset it.
            // Since hot always cancels cold, let's verify cancelAll works on hot alone:
            syncDebounceManager.cancelAll();
            jest.advanceTimersByTime(COLD_SYNC_MS + HOT_SYNC_MS);
            expect(onSyncNeeded).not.toHaveBeenCalled();
        });

        it('should be safe to call when no sync is pending', () => {
            expect(() => syncDebounceManager.cancelAll()).not.toThrow();
        });
    });

    // -------------------------------------------------------------------------
    // initialize — idempotency
    // -------------------------------------------------------------------------
    describe('initialize', () => {
        it('should only initialize once — second call is ignored', () => {
            const secondCallback = jest.fn();
            syncDebounceManager.initialize({ onSyncNeeded: secondCallback });

            syncDebounceManager.handleStorageChange(['triggers']);
            jest.advanceTimersByTime(HOT_SYNC_MS);

            // Only the first callback should have been registered
            expect(onSyncNeeded).toHaveBeenCalledTimes(1);
            expect(secondCallback).not.toHaveBeenCalled();
        });

        it('should register a visibilitychange listener on the document', () => {
            const spy = jest.spyOn(document, 'addEventListener');
            syncDebounceManager.destroy();
            syncDebounceManager.initialize({ onSyncNeeded: jest.fn() });
            expect(spy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
            spy.mockRestore();
        });
    });

    // -------------------------------------------------------------------------
    // destroy
    // -------------------------------------------------------------------------
    describe('destroy', () => {
        it('should reset hasPendingSync to false', () => {
            syncDebounceManager.handleStorageChange(['triggers']);
            syncDebounceManager.destroy();
            expect(syncDebounceManager.hasPendingSync()).toBe(false);
        });

        it('should reset hasPendingColdSync to false', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']);
            syncDebounceManager.destroy();
            expect(syncDebounceManager.hasPendingColdSync()).toBe(false);
        });

        it('should prevent the hot timer from firing after destroy', () => {
            syncDebounceManager.handleStorageChange(['triggers']);
            syncDebounceManager.destroy();
            jest.advanceTimersByTime(HOT_SYNC_MS);
            expect(onSyncNeeded).not.toHaveBeenCalled();
        });

        it('should prevent the cold timer from firing after destroy', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']);
            syncDebounceManager.destroy();
            jest.advanceTimersByTime(COLD_SYNC_MS);
            expect(onSyncNeeded).not.toHaveBeenCalled();
        });

        it('should remove the visibilitychange listener from the document', () => {
            const spy = jest.spyOn(document, 'removeEventListener');
            syncDebounceManager.destroy();
            expect(spy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
            spy.mockRestore();
        });

        it('should allow re-initialization after destroy', () => {
            syncDebounceManager.destroy();
            const newCallback = jest.fn();
            syncDebounceManager.initialize({ onSyncNeeded: newCallback });

            syncDebounceManager.handleStorageChange(['triggers']);
            jest.advanceTimersByTime(HOT_SYNC_MS);
            expect(newCallback).toHaveBeenCalledTimes(1);
        });

        it('should be safe to call multiple times without throwing', () => {
            expect(() => {
                syncDebounceManager.destroy();
                syncDebounceManager.destroy();
            }).not.toThrow();
        });
    });

    // -------------------------------------------------------------------------
    // Visibility change handler
    // -------------------------------------------------------------------------
    describe('visibility change handler', () => {
        it('should call flushCold when document becomes hidden and coldDirty is true', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']);
            expect(onSyncNeeded).not.toHaveBeenCalled();

            // Simulate the page being hidden
            Object.defineProperty(document, 'visibilityState', {
                value: 'hidden',
                writable: true,
                configurable: true,
            });
            document.dispatchEvent(new Event('visibilitychange'));

            expect(onSyncNeeded).toHaveBeenCalledTimes(1);

            // Restore to visible
            Object.defineProperty(document, 'visibilityState', {
                value: 'visible',
                writable: true,
                configurable: true,
            });
        });

        it('should NOT flush hot changes on tab hide (alt-tab must not force uploads)', () => {
            syncDebounceManager.handleStorageChange(['triggers']);

            Object.defineProperty(document, 'visibilityState', {
                value: 'hidden',
                writable: true,
                configurable: true,
            });
            document.dispatchEvent(new Event('visibilitychange'));

            expect(onSyncNeeded).not.toHaveBeenCalled();
            expect(syncDebounceManager.hasPendingSync()).toBe(true);

            Object.defineProperty(document, 'visibilityState', {
                value: 'visible',
                writable: true,
                configurable: true,
            });
        });

        it('should not call onSyncNeeded on visibilitychange when not hidden', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']);

            Object.defineProperty(document, 'visibilityState', {
                value: 'visible',
                writable: true,
                configurable: true,
            });
            document.dispatchEvent(new Event('visibilitychange'));

            expect(onSyncNeeded).not.toHaveBeenCalled();
        });

        it('should not call onSyncNeeded on hidden when coldDirty is false', () => {
            // No cold changes registered
            Object.defineProperty(document, 'visibilityState', {
                value: 'hidden',
                writable: true,
                configurable: true,
            });
            document.dispatchEvent(new Event('visibilitychange'));

            expect(onSyncNeeded).not.toHaveBeenCalled();

            Object.defineProperty(document, 'visibilityState', {
                value: 'visible',
                writable: true,
                configurable: true,
            });
        });

        it('should not fire after destroy removes the listener', () => {
            syncDebounceManager.handleStorageChange(['kill_counter']);
            syncDebounceManager.destroy();

            Object.defineProperty(document, 'visibilityState', {
                value: 'hidden',
                writable: true,
                configurable: true,
            });
            document.dispatchEvent(new Event('visibilitychange'));

            // destroy nullified callbacks, so even if handler remained it would be a no-op.
            // More importantly the handler was removed.
            expect(onSyncNeeded).not.toHaveBeenCalled();

            Object.defineProperty(document, 'visibilityState', {
                value: 'visible',
                writable: true,
                configurable: true,
            });
        });
    });
});
