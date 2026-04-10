import MapHelper from '@shared/map/MapHelper';

vi.mock('mudlet-map-renderer', () => ({ MapReader: function () {} }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal MapHelperClient that captures event listeners so tests can fire them.
 * The `on` mock is transparent — it stores all listeners including the ones
 * registered in the MapHelper constructor (e.g. 'stepBack').
 */
function createClient() {
    const listeners: Record<string, Array<(detail?: any) => void>> = {};

    const client: any = {
        on: jest.fn((event: string, listener: (detail?: any) => void, _options?: any) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(listener);
        }),
        sendEvent: jest.fn(),
        sendCommand: jest.fn(),
        getSuppressMapMoveEvent: jest.fn(() => false),
        setSuppressMapMoveEvent: jest.fn(),
        functionalBind: { set: jest.fn() },
        shouldSetDrinkableBind: jest.fn(() => true),
        /** Fire every registered listener for the given event. */
        emit(event: string, detail?: any) {
            (listeners[event] ?? []).forEach(fn => fn(detail));
        },
    };

    return { client, listeners };
}

// ---------------------------------------------------------------------------
// MapHelper.parseBind
// ---------------------------------------------------------------------------

describe('MapHelper.parseBind', () => {
    describe('single command', () => {
        it('should return a single entry with null delay when there is no asterisk', () => {
            const result = MapHelper.parseBind('fuknij');
            expect(result).toEqual([{ command: 'fuknij', delay: null }]);
        });

        it('should return a single entry with a float delay when separated by asterisk', () => {
            const result = MapHelper.parseBind('fuknij*0.7');
            expect(result).toEqual([{ command: 'fuknij', delay: 0.7 }]);
        });

        it('should return a single entry with an integer delay', () => {
            const result = MapHelper.parseBind('usmiech*2');
            expect(result).toEqual([{ command: 'usmiech', delay: 2 }]);
        });

        it('should return delay of 0 when delay value is zero', () => {
            // parseFloat('0') === 0, isNaN(0) === false, so delay should be 0 (not null)
            const result = MapHelper.parseBind('cmd*0');
            expect(result).toEqual([{ command: 'cmd', delay: 0 }]);
        });
    });

    describe('multiple commands', () => {
        it('should split on # and return entries with correct delays', () => {
            const result = MapHelper.parseBind('fuknij#westchnij*0.7#usmiech*2');
            expect(result).toEqual([
                { command: 'fuknij', delay: null },
                { command: 'westchnij', delay: 0.7 },
                { command: 'usmiech', delay: 2 },
            ]);
        });

        it('should split on ; separator the same way as #', () => {
            const result = MapHelper.parseBind('fuknij;westchnij*0.7;usmiech*2');
            expect(result).toEqual([
                { command: 'fuknij', delay: null },
                { command: 'westchnij', delay: 0.7 },
                { command: 'usmiech', delay: 2 },
            ]);
        });

        it('should handle a mix of # and ; separators in one string', () => {
            const result = MapHelper.parseBind('cmd1#cmd2;cmd3*1.5');
            expect(result).toEqual([
                { command: 'cmd1', delay: null },
                { command: 'cmd2', delay: null },
                { command: 'cmd3', delay: 1.5 },
            ]);
        });

        it('should correctly parse two adjacent no-delay commands', () => {
            const result = MapHelper.parseBind('wez;poloz');
            expect(result).toEqual([
                { command: 'wez', delay: null },
                { command: 'poloz', delay: null },
            ]);
        });
    });

    describe('edge cases', () => {
        it('should return an empty array for an empty string', () => {
            const result = MapHelper.parseBind('');
            expect(result).toEqual([]);
        });

        it('should skip empty segments produced by a leading separator', () => {
            const result = MapHelper.parseBind('#cmd');
            expect(result).toEqual([{ command: 'cmd', delay: null }]);
        });

        it('should skip empty segments produced by a trailing separator', () => {
            const result = MapHelper.parseBind('cmd#');
            expect(result).toEqual([{ command: 'cmd', delay: null }]);
        });

        it('should skip empty segments produced by consecutive separators', () => {
            const result = MapHelper.parseBind('cmd1##cmd2');
            expect(result).toEqual([
                { command: 'cmd1', delay: null },
                { command: 'cmd2', delay: null },
            ]);
        });

        it('should return null delay when nothing follows the asterisk', () => {
            // parseFloat('') is NaN, so delay must be null
            const result = MapHelper.parseBind('cmd*');
            expect(result).toEqual([{ command: 'cmd', delay: null }]);
        });

        it('should return null delay when the text after asterisk is not numeric', () => {
            // parseFloat('abc') is NaN, so delay must be null
            const result = MapHelper.parseBind('cmd*abc');
            expect(result).toEqual([{ command: 'cmd', delay: null }]);
        });

        it('should return an empty array for a string that is only separators', () => {
            const result = MapHelper.parseBind('###');
            expect(result).toEqual([]);
        });
    });
});

// ---------------------------------------------------------------------------
// MapHelper.getBindPrintable
// ---------------------------------------------------------------------------

describe('MapHelper.getBindPrintable', () => {
    it('should strip delays and join commands with semicolons for #-separated input', () => {
        const result = MapHelper.getBindPrintable('fuknij#westchnij*0.7#usmiech*2');
        expect(result).toBe('fuknij;westchnij;usmiech');
    });

    it('should work when the original separator is already a semicolon', () => {
        const result = MapHelper.getBindPrintable('fuknij;westchnij*0.7;usmiech*2');
        expect(result).toBe('fuknij;westchnij;usmiech');
    });

    it('should strip the delay from a single command', () => {
        const result = MapHelper.getBindPrintable('cmd*3');
        expect(result).toBe('cmd');
    });

    it('should return the command unchanged when there is no delay', () => {
        const result = MapHelper.getBindPrintable('cmd');
        expect(result).toBe('cmd');
    });

    it('should return an empty string for empty input', () => {
        const result = MapHelper.getBindPrintable('');
        expect(result).toBe('');
    });

    it('should skip empty segments produced by consecutive separators', () => {
        const result = MapHelper.getBindPrintable('cmd1##cmd2');
        expect(result).toBe('cmd1;cmd2');
    });

    it('should handle mixed # and ; separators and produce semicolon output', () => {
        const result = MapHelper.getBindPrintable('cmd1#cmd2;cmd3*1.5');
        expect(result).toBe('cmd1;cmd2;cmd3');
    });
});

// ---------------------------------------------------------------------------
// executeBind — tested through handleNewLocation (public interface)
//
// Flow:
//   1. map.handleNewLocation({room}) registers an 'output-sent' one-shot listener.
//   2. When 'output-sent' fires (and the room ID matches the current room),
//      the listener calls functionalBind.set(printable, bindCallback).
//   3. Invoking bindCallback calls the private executeBind(bindStr), which sends
//      immediate commands synchronously and delayed commands via setTimeout.
//
// To isolate executeBind we:
//   - set map.currentRoom to match the room so the ID guard passes
//   - emit 'output-sent' to trigger the functionalBind registration
//   - extract the registered callback from functionalBind.set's call args
//   - invoke it directly, then check sendCommand call history
// ---------------------------------------------------------------------------

describe('MapHelper executeBind (via handleNewLocation)', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    /**
     * Sets up a MapHelper with a room that has the given bind string, emits
     * 'output-sent' so that functionalBind.set is called, and returns both the
     * client mock and the captured bind-execution callback.
     */
    function setupAndGetBindCallback(bindStr: string) {
        const { client } = createClient();
        const map = new MapHelper(client, { storage: { getItem: () => null, setItem: () => {} } });

        const room: any = { id: 42, userData: { bind: bindStr } };

        // Set currentRoom so the room-ID guard inside the output-sent handler passes
        map.currentRoom = room;

        map.handleNewLocation({ room });

        // Fire output-sent — this calls functionalBind.set(printable, fn)
        client.emit('output-sent');

        // Extract the callback registered with functionalBind.set
        expect(client.functionalBind.set).toHaveBeenCalledTimes(1);
        const bindCallback: () => void = client.functionalBind.set.mock.calls[0][1];

        return { client, bindCallback };
    }

    it('should send an immediate command synchronously when the bind callback is invoked', () => {
        const { client, bindCallback } = setupAndGetBindCallback('fuknij');

        bindCallback();

        expect(client.sendCommand).toHaveBeenCalledTimes(1);
        expect(client.sendCommand).toHaveBeenCalledWith('fuknij');
    });

    it('should schedule a delayed command via setTimeout rather than calling sendCommand immediately', () => {
        const { client, bindCallback } = setupAndGetBindCallback('westchnij*0.7');

        bindCallback();

        // No immediate call
        expect(client.sendCommand).not.toHaveBeenCalled();

        // After 700 ms the command fires
        jest.advanceTimersByTime(700);

        expect(client.sendCommand).toHaveBeenCalledTimes(1);
        expect(client.sendCommand).toHaveBeenCalledWith('westchnij');
    });

    it('should use delay * 1000 as the setTimeout duration', () => {
        const { client, bindCallback } = setupAndGetBindCallback('cmd*2');

        bindCallback();

        expect(client.sendCommand).not.toHaveBeenCalled();

        // 1 ms before the deadline — must not have fired yet
        jest.advanceTimersByTime(1999);
        expect(client.sendCommand).not.toHaveBeenCalled();

        // Exactly at the deadline
        jest.advanceTimersByTime(1);
        expect(client.sendCommand).toHaveBeenCalledWith('cmd');
    });

    it('should send immediate commands at once and schedule delayed ones in order', () => {
        const { client, bindCallback } = setupAndGetBindCallback('fuknij#westchnij*0.7#usmiech*2');

        bindCallback();

        // First command: immediate
        expect(client.sendCommand).toHaveBeenCalledTimes(1);
        expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'fuknij');

        // Second command: 700 ms delay
        jest.advanceTimersByTime(700);
        expect(client.sendCommand).toHaveBeenCalledTimes(2);
        expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'westchnij');

        // Third command: 2000 ms total (1300 ms after the 700 ms mark)
        jest.advanceTimersByTime(1300);
        expect(client.sendCommand).toHaveBeenCalledTimes(3);
        expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'usmiech');
    });

    it('should treat delay === 0 as immediate (sends synchronously, not via setTimeout)', () => {
        // The condition in executeBind is `cmd.delay != null && cmd.delay > 0`
        // For delay === 0 that is false, so the command is sent synchronously.
        const { client, bindCallback } = setupAndGetBindCallback('cmd*0');

        bindCallback();

        expect(client.sendCommand).toHaveBeenCalledTimes(1);
        expect(client.sendCommand).toHaveBeenCalledWith('cmd');
    });

    it('should register the printable bind string with functionalBind on output-sent', () => {
        const { client } = createClient();
        const map = new MapHelper(client, { storage: { getItem: () => null, setItem: () => {} } });

        const room: any = { id: 99, userData: { bind: 'fuknij#westchnij*0.7#usmiech*2' } };
        map.currentRoom = room;
        map.handleNewLocation({ room });

        client.emit('output-sent');

        expect(client.functionalBind.set).toHaveBeenCalledWith(
            'fuknij;westchnij;usmiech',
            expect.any(Function),
        );
    });

    it('should not call functionalBind.set before output-sent is emitted', () => {
        const { client } = createClient();
        const map = new MapHelper(client, { storage: { getItem: () => null, setItem: () => {} } });

        const room: any = { id: 42, userData: { bind: 'fuknij' } };
        map.currentRoom = room;
        map.handleNewLocation({ room });

        // output-sent has NOT been emitted yet
        expect(client.functionalBind.set).not.toHaveBeenCalled();
        expect(client.sendCommand).not.toHaveBeenCalled();
    });

    it('should not register the bind when stepBack aborts before output-sent fires', () => {
        const { client } = createClient();
        const map = new MapHelper(client, { storage: { getItem: () => null, setItem: () => {} } });

        const room: any = { id: 42, userData: { bind: 'fuknij' } };
        map.currentRoom = room;
        map.handleNewLocation({ room });

        // The constructor registers a 'stepBack' listener that calls pendingBindAbort.abort()
        client.emit('stepBack');

        // Now output-sent fires — the abort signal should cause the handler to return early
        client.emit('output-sent');

        expect(client.functionalBind.set).not.toHaveBeenCalled();
        expect(client.sendCommand).not.toHaveBeenCalled();
    });

    it('should not register bind when currentRoom has a different id than the room given to handleNewLocation', () => {
        const { client } = createClient();
        const map = new MapHelper(client, { storage: { getItem: () => null, setItem: () => {} } });

        // The player has already moved to a different room before output-sent fires
        const handledRoom: any = { id: 42, userData: { bind: 'fuknij' } };
        const differentRoom: any = { id: 99, userData: {} };

        map.handleNewLocation({ room: handledRoom });

        // currentRoom is now a different room (player moved away before output arrived)
        map.currentRoom = differentRoom;

        client.emit('output-sent');

        // Guard condition: currentRoom.id (99) !== handledRoom.id (42) — should bail out
        expect(client.functionalBind.set).not.toHaveBeenCalled();
    });
});
