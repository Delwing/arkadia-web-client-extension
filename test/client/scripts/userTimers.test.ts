import { EventEmitter } from 'events';
import { vi } from 'vitest';
import initUserTimers, { isValidTimerSeconds, timerLabel, type UserTimer } from '@client/scripts/userTimers';
import { characterStorage, globalStorage } from '@modules/core/storage';
import { setAutomationGroupEnabled } from '@modules/core/automation';
import { applyLinelessMacro } from '@client/scripts/userTriggers';

class TimerClient {
    private emitter = new EventEmitter();
    sendCommand = vi.fn();
    sendEvent = vi.fn();
    println = vi.fn();
    FunctionalBind = { set: vi.fn() };
    on(event: string, cb: (...args: any[]) => void) {
        this.emitter.on(event, cb);
        return () => this.emitter.off(event, cb);
    }
    off(event: string, cb: (...args: any[]) => void) {
        this.emitter.off(event, cb);
    }
    emit(event: string, detail?: unknown) {
        this.emitter.emit(event, detail);
    }
    /** Connected and logged in. */
    login(name = 'Gandalf') {
        this.emit('client.connect');
        this.emit('gmcp.char.info', { name });
    }
}

const timer = (patch: Partial<UserTimer> = {}): UserTimer => ({
    id: 't1',
    seconds: 10,
    macros: [{ type: 'command', command: 'napij sie' }],
    ...patch,
});

function setup(timers: UserTimer[]) {
    globalStorage.set('automationTimers', timers);
    const client = new TimerClient();
    initUserTimers(client as never);
    return client;
}

describe('user timers', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        localStorage.clear();
    });

    it('runs its actions every interval once a character is in the game', () => {
        const client = setup([timer()]);
        vi.advanceTimersByTime(30_000);
        expect(client.sendCommand).not.toHaveBeenCalled();

        client.login();
        vi.advanceTimersByTime(9_999);
        expect(client.sendCommand).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(client.sendCommand).toHaveBeenCalledWith('napij sie');
        vi.advanceTimersByTime(20_000);
        expect(client.sendCommand).toHaveBeenCalledTimes(3);
    });

    it('does not count on the login screen: connected without Char.Info', () => {
        const client = setup([timer()]);
        client.emit('client.connect');
        vi.advanceTimersByTime(60_000);
        expect(client.sendCommand).not.toHaveBeenCalled();
    });

    it('stops on disconnect and starts from zero after the next login', () => {
        const client = setup([timer()]);
        client.login();
        vi.advanceTimersByTime(5_000);
        client.emit('client.disconnect');
        vi.advanceTimersByTime(60_000);
        expect(client.sendCommand).not.toHaveBeenCalled();

        client.login();
        vi.advanceTimersByTime(10_000);
        expect(client.sendCommand).toHaveBeenCalledTimes(1);
    });

    it('keeps counting through a resumed proxy session, which brings no Char.Info', () => {
        const client = setup([timer()]);
        client.emit('client.connect');
        client.emit('proxy.session', { resumed: true, upstreamClosed: false });
        vi.advanceTimersByTime(10_000);
        expect(client.sendCommand).toHaveBeenCalledTimes(1);
    });

    it('fires a one-off timer once per start', () => {
        globalStorage.set('automationGroups', [{ id: 'g', name: 'Opoznione' }]);
        const client = setup([timer({ once: true, group: 'g' })]);
        client.login();
        vi.advanceTimersByTime(60_000);
        expect(client.sendCommand).toHaveBeenCalledTimes(1);

        // Off and on again (as two group actions in a trigger would) starts it over.
        setAutomationGroupEnabled('g', false);
        setAutomationGroupEnabled('g', true);
        vi.advanceTimersByTime(9_000);
        expect(client.sendCommand).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(1_000);
        expect(client.sendCommand).toHaveBeenCalledTimes(2);
    });

    it('follows its switch, its group and its characters', () => {
        globalStorage.set('automationGroups', [{ id: 'g', name: 'Walka' }]);
        const client = setup([timer({ group: 'g', characters: ['Gandalf'] })]);
        client.login();
        characterStorage.setCharacter('Frodo');
        vi.advanceTimersByTime(30_000);
        expect(client.sendCommand).not.toHaveBeenCalled();

        characterStorage.setCharacter('Gandalf');
        setAutomationGroupEnabled('g', false);
        vi.advanceTimersByTime(30_000);
        expect(client.sendCommand).not.toHaveBeenCalled();

        setAutomationGroupEnabled('g', true);
        vi.advanceTimersByTime(10_000);
        expect(client.sendCommand).toHaveBeenCalledTimes(1);

        globalStorage.set('automationTimers', [timer({ group: 'g', characters: ['Gandalf'], enabled: false })]);
        vi.advanceTimersByTime(30_000);
        expect(client.sendCommand).toHaveBeenCalledTimes(1);
    });

    it('restarts only the timer that changed', () => {
        const client = setup([timer(), timer({ id: 't2', seconds: 4, macros: [{ type: 'command', command: 'drugi' }] })]);
        client.login();
        vi.advanceTimersByTime(6_000);
        // t2 has fired once (at 4 s); t1 is 6 s into its 10.
        globalStorage.set('automationTimers', [
            timer(),
            timer({ id: 't2', seconds: 4, macros: [{ type: 'command', command: 'trzeci' }] }),
        ]);
        vi.advanceTimersByTime(4_000);
        expect(client.sendCommand.mock.calls.map(c => c[0])).toEqual(['drugi', 'napij sie', 'trzeci']);
    });

    it('ignores timers with no valid interval or no actions', () => {
        const client = setup([timer({ seconds: 0 }), timer({ id: 't2', seconds: 0.2 }), timer({ id: 't3', macros: [] })]);
        client.login();
        vi.advanceTimersByTime(60_000);
        expect(client.sendCommand).not.toHaveBeenCalled();
    });

    describe('started and stopped by an action', () => {
        const start = (id = 't1') => applyLinelessMacro(client as never, { type: 'timer', timerId: id }, t => t);
        const halt = (id = 't1') => applyLinelessMacro(client as never, { type: 'timer', timerId: id, timerState: 'stop' }, t => t);
        let client: TimerClient;

        it('waits for an action, then repeats until one stops it', () => {
            client = setup([timer({ start: 'action' })]);
            client.login();
            vi.advanceTimersByTime(60_000);
            expect(client.sendCommand).not.toHaveBeenCalled();

            start();
            vi.advanceTimersByTime(25_000);
            expect(client.sendCommand).toHaveBeenCalledTimes(2);

            halt();
            vi.advanceTimersByTime(60_000);
            expect(client.sendCommand).toHaveBeenCalledTimes(2);
        });

        it('starts a one-off over from zero on every start, firing once', () => {
            client = setup([timer({ start: 'action', once: true })]);
            client.login();
            start();
            vi.advanceTimersByTime(8_000);
            start();
            vi.advanceTimersByTime(8_000);
            expect(client.sendCommand).not.toHaveBeenCalled();
            vi.advanceTimersByTime(2_000);
            expect(client.sendCommand).toHaveBeenCalledTimes(1);
            vi.advanceTimersByTime(60_000);
            expect(client.sendCommand).toHaveBeenCalledTimes(1);

            start();
            vi.advanceTimersByTime(10_000);
            expect(client.sendCommand).toHaveBeenCalledTimes(2);
        });

        it('forgets the start when the session ends', () => {
            client = setup([timer({ start: 'action' })]);
            client.login();
            start();
            client.emit('client.disconnect');
            client.login();
            vi.advanceTimersByTime(60_000);
            expect(client.sendCommand).not.toHaveBeenCalled();
        });

        it('is ignored outside the game and for a timer that is off', () => {
            client = setup([timer({ start: 'action' }), timer({ id: 'off', start: 'action', enabled: false })]);
            start();
            client.login();
            start('off');
            vi.advanceTimersByTime(60_000);
            expect(client.sendCommand).not.toHaveBeenCalled();
        });

        it('restarts an automatic timer from zero, or stops it until it is next switched on', () => {
            client = setup([timer()]);
            client.login();
            vi.advanceTimersByTime(8_000);
            start();
            vi.advanceTimersByTime(8_000);
            expect(client.sendCommand).not.toHaveBeenCalled();
            vi.advanceTimersByTime(2_000);
            expect(client.sendCommand).toHaveBeenCalledTimes(1);

            halt();
            vi.advanceTimersByTime(60_000);
            expect(client.sendCommand).toHaveBeenCalledTimes(1);

            globalStorage.set('automationTimers', [timer({ enabled: false })]);
            globalStorage.set('automationTimers', [timer()]);
            vi.advanceTimersByTime(10_000);
            expect(client.sendCommand).toHaveBeenCalledTimes(2);
        });

        it('lets one timer start another', () => {
            client = setup([
                timer({ id: 'first', seconds: 5, once: true, macros: [{ type: 'timer', timerId: 'second' }] }),
                timer({ id: 'second', seconds: 3, once: true, start: 'action', macros: [{ type: 'command', command: 'drugi' }] }),
            ]);
            client.login();
            vi.advanceTimersByTime(7_999);
            expect(client.sendCommand).not.toHaveBeenCalled();
            vi.advanceTimersByTime(1);
            expect(client.sendCommand).toHaveBeenCalledWith('drugi');
        });
    });

    it('describes the interval in words', () => {
        expect(timerLabel({ seconds: 30 })).toBe('co 30 s');
        expect(timerLabel({ seconds: 90, once: true })).toBe('raz po 1 min 30 s');
        expect(timerLabel({ seconds: 7200 })).toBe('co 2 h');
        expect(timerLabel({ seconds: 1.5 })).toBe('co 1.5 s');
        expect(isValidTimerSeconds(0.5)).toBe(false);
        expect(isValidTimerSeconds(86_400)).toBe(true);
        expect(isValidTimerSeconds(86_401)).toBe(false);
    });
});
