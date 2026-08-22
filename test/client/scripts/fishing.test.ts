import { describe, test, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import eventBus from '@modules/core/eventBus';
import initFishing, { matchFishHint, BAIT_OPTIONS } from '@client/scripts/fishing';

function createClient(): Client {
    return new Client({
        send: () => {},
        output: () => {},
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => false,
    });
}

const CAST = 'Bierzesz prowizoryczna wedka zamach i zarzucasz ja daleko w wode.';
const BITING = 'Nagle dostrzegasz, ze zanurzony w wodzie sznurek prowizorycznej wedki napina sie!';
const PULLING = 'Energicznym ruchem pociagasz za napieta prowizoryczna wedke, zacinajac zlapana na haczyk rybe i rozpoczynajac z nia walke.';
const CAUGHT = 'Wyciagasz zlapana rybe na powierzchnie.';
const BROKEN = 'Slyszysz suchy trzask i dostrzegasz, ze zdobycz zerwala sie z prowizorycznej wedki, lamiac ja przy tym.';
const ESCAPED = 'Sznurek prostej leszczynowej wedki opada swobodnie na wode, zapewne zlapanej nan rybie udalo sie zerwac.';
const DRAGGED = 'Nagle prosta leszczynowa wedka zostaje wciagnieta pod wode!';
const NOT_CAST = 'Prosta leszczynowa wedka nie jest zarzucona.';

describe('fishing', () => {
    let client: Client;
    let api: ReturnType<typeof initFishing>;
    let states: string[];
    let sounds: string[];
    let commands: string[];
    let offs: (() => void)[];
    let setBind: ReturnType<typeof vi.spyOn>;
    let clearBind: ReturnType<typeof vi.spyOn>;

    beforeAll(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        api = initFishing(client, client.aliases);
    });

    beforeEach(() => {
        states = [];
        sounds = [];
        commands = [];
        const s = states, so = sounds, c = commands;
        offs = [
            eventBus.on('fishing.state', (p: any) => { s.push(p.state); }),
            client.on('sound:category', (v: string) => { so.push(v); }),
            client.on('command', (v: string) => { c.push(v); }),
        ];
        setBind = vi.spyOn(client.FunctionalBind, 'set').mockImplementation(() => {});
        clearBind = vi.spyOn(client.FunctionalBind, 'clear').mockImplementation(() => {});
        api.setState('idle');
        states.length = 0;
    });

    afterEach(() => {
        offs.forEach(off => off());
        vi.restoreAllMocks();
    });

    describe('the fishing cycle', () => {
        test('casting the rod starts fishing', () => {
            const [out] = client.onLine(CAST, 'text');

            expect(out.text).toBe(CAST);
            expect(api.getState()).toBe('fishing');
            expect(states).toEqual(['fishing']);
        });

        test('a bite offers the strike bind and beeps', () => {
            client.onLine(CAST, 'text');

            client.onLine(BITING, 'text');

            expect(api.getState()).toBe('biting');
            expect(setBind).toHaveBeenCalledWith('zatnij rybe na wedce', undefined, true);
            expect(sounds).toContain('fishing');
        });

        test('striking moves to the fight and clears the bind', () => {
            client.onLine(BITING, 'text');

            client.onLine(PULLING, 'text');

            expect(api.getState()).toBe('pulling');
            expect(clearBind).toHaveBeenCalled();
        });

        test('landing the fish goes back to idle', () => {
            client.onLine(PULLING, 'text');

            client.onLine(CAUGHT, 'text');

            expect(api.getState()).toBe('idle');
        });

        test('each stage is coloured', () => {
            expect(client.onLine(CAST, 'text')[0].toHtml()).toContain('#');
            expect(client.onLine(BITING, 'text')[0].toHtml()).toContain('#');
            expect(client.onLine(PULLING, 'text')[0].toHtml()).toContain('#');
            expect(client.onLine(CAUGHT, 'text')[0].toHtml()).toContain('#');
        });
    });

    describe('things going wrong', () => {
        test.each([
            ['the rod snapping', BROKEN],
            ['the fish escaping', ESCAPED],
            ['the rod being dragged under', DRAGGED],
            ['the rod not being cast', NOT_CAST],
            ['pulling the rod out', 'Wyciagasz prowizoryczna wedke z wody.'],
            ['grabbing and pulling it out', 'Chwytasz za prowizoryczna wedke i wyciagasz ja z wody.'],
        ])('%s returns to idle and clears the bind', (_label, line) => {
            client.onLine(CAST, 'text');
            clearBind.mockClear();

            client.onLine(line, 'text');

            expect(api.getState()).toBe('idle');
            expect(clearBind).toHaveBeenCalled();
        });
    });

    describe('fish hints', () => {
        test('a known fish colour resolves to a hint', () => {
            const known = matchFishHint('brazowoszara ryba');

            expect(known).not.toBeNull();
            expect(known!.hint).toBeTruthy();
        });

        test('an unknown description resolves to nothing', () => {
            expect(matchFishHint('zwykly kamien')).toBeNull();
        });

        test('a fish mentioned in output gets a hover hint', () => {
            const [out] = client.onLine('Widzisz brazowoszara ryba w wodzie.', 'text');

            expect(out.toHtml()).toContain('title=');
        });
    });

    describe('the popup', () => {
        test('/wedka opens it with the current state', async () => {
            let payload: any = null;
            const off = eventBus.on('fishing.popup.open', (p: any) => { payload = p; });
            client.onLine(CAST, 'text');

            await client.sendCommand('/wedka');
            off();

            expect(payload.state).toBe('fishing');
            expect(payload.castTimestamp).toBeTypeOf('number');
        });

        test('the cast timestamp is cleared when idle', async () => {
            let payload: any = null;
            const off = eventBus.on('fishing.popup.open', (p: any) => { payload = p; });

            await client.sendCommand('/wedka');
            off();

            expect(payload.castTimestamp).toBeNull();
        });

        test.each(BAIT_OPTIONS.map(o => o.value))('a cast request baits with %s', async (bait) => {
            eventBus.emit('fishing.cast', { bait });
            // The two halves of "…;zarzuc wedke" are dispatched across a tick.
            await new Promise(r => setTimeout(r, 0));

            expect(commands).toContain(`zawies ${bait} na wedce`);
            expect(commands).toContain('zarzuc wedke');
        });

        test('a cast request with no bait defaults to kulke', () => {
            eventBus.emit('fishing.cast', {});

            expect(commands).toContain('zawies kulke na wedce');
        });

        test('a pull request pulls the rod', () => {
            eventBus.emit('fishing.pull');

            expect(commands).toContain('wyciagnij wedke');
        });

        test('a strike request strikes', () => {
            eventBus.emit('fishing.strike');

            expect(commands).toContain('zatnij rybe na wedce');
        });
    });

    test('unrelated output is untouched', () => {
        const [out] = client.onLine('Jestes lekko zmeczony.', 'text');

        expect(out.text).toBe('Jestes lekko zmeczony.');
        expect(states).toEqual([]);
    });
});
