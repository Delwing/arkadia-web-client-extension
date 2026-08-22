import { describe, test, expect, beforeEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import { LUA_GAGS_STORAGE_KEY, LuaGagDeleteMode } from '@client/luaGagsSettings';
import registerGagTriggers from '@client/scripts/gags';

function createClient(): Client {
    return new Client({
        send: () => {},
        output: () => {},
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => true,
    });
}

/** Set the delete mode for own-hit lines: 0 = untouched, 1 = delete, 2 = prefix. */
function setOwnHitsMode(mode: LuaGagDeleteMode) {
    characterStorage.set(LUA_GAGS_STORAGE_KEY, { moje_ciosy: mode } as any);
}

describe('gags — own regular hits', () => {
    let client: Client;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        registerGagTriggers(client);
    });

    describe('mode 2 (prefix) — the default', () => {
        test.each([
            ['Ledwo muskasz wielkiego szczura.', '[1/6] '],
            ['Lekko ranisz wielkiego szczura.', '[2/6] '],
            ['Ranisz wielkiego szczura.', '[3/6] '],
            ['Powaznie ranisz wielkiego szczura.', '[4/6] '],
            ['Bardzo ciezko ranisz wielkiego szczura.', '[5/6] '],
            ['Masakrujesz wielkiego szczura.', '[6/6] '],
        ])('%s gets the power prefix %s', (line, prefix) => {
            const [out] = client.onLine(line, 'combat.avatar');

            expect(out).toBeDefined();
            expect(out.text.startsWith(prefix)).toBe(true);
            expect(out.text).toContain('wielkiego szczura');
        });

        test('the line is still rendered — prefixing is not suppression', () => {
            const parts = client.onLine('Ranisz wielkiego szczura.', 'combat.avatar');

            expect(parts).toHaveLength(1);
            expect(parts[0].deleted).toBe(false);
        });

        test('applies to every combat message type', () => {
            for (const type of ['combat.avatar', 'combat.team', 'combat.others']) {
                const [out] = client.onLine('Ranisz wielkiego szczura.', type);
                expect(out.text.startsWith('[3/6] '), type).toBe(true);
            }
        });
    });

    describe('mode 1 (delete)', () => {
        beforeEach(() => setOwnHitsMode(1));

        test('the line is suppressed entirely', () => {
            const parts = client.onLine('Ranisz wielkiego szczura.', 'combat.avatar');

            expect(parts).toHaveLength(0);
        });

        test('deleting does not stop dispatch — later triggers still see the line', () => {
            // Suppression is a rendering decision. A gagged hit is still a hit, so
            // counters and state machines downstream must be told about it.
            let seen: string | null = null;
            client.Triggers.registerTrigger(/Ranisz/, (line) => {
                seen = line.text;
                return line;
            });

            const parts = client.onLine('Ranisz wielkiego szczura.', 'combat.avatar');

            expect(seen).toBe('Ranisz wielkiego szczura.');
            expect(parts, 'but it is still not rendered').toHaveLength(0);
        });

        test('a trigger that opts out of suppressed lines is skipped', () => {
            let seen: string | null = null;
            client.Triggers.registerTrigger(/Ranisz/, (line) => {
                seen = line.text;
                return line;
            }, 'optedOut', {skipDeleted: true});

            client.onLine('Ranisz wielkiego szczura.', 'combat.avatar');

            expect(seen).toBeNull();
        });
    });

    describe('what downstream scripts receive', () => {
        test('mode 2 hands the prefixed buffer to later triggers', () => {
            // combatWindow depends on exactly this: it clones the buffer it is
            // given, so it must already carry the gag prefix and colour.
            let seen: string | null = null;
            client.Triggers.registerTrigger(/szczura/, (line) => {
                seen = line.text;
                return line;
            });

            client.onLine('Ranisz wielkiego szczura.', 'combat.avatar');

            expect(seen).toBe('[3/6] Ranisz wielkiego szczura.');
        });
    });

    describe('mode 0 (leave alone)', () => {
        beforeEach(() => setOwnHitsMode(0));

        test('the line passes through untouched', () => {
            const parts = client.onLine('Ranisz wielkiego szczura.', 'combat.avatar');

            expect(parts).toHaveLength(1);
            expect(parts[0].text).toBe('Ranisz wielkiego szczura.');
        });
    });

    describe('scope', () => {
        test('non-combat line types are never touched', () => {
            const [out] = client.onLine('Ranisz wielkiego szczura.', 'text');

            expect(out.text).toBe('Ranisz wielkiego szczura.');
        });

        test('a combat line that is not an own regular hit is left alone', () => {
            const [out] = client.onLine('Wielki szczur gryzie cie w noge.', 'combat.avatar');

            expect(out.text).toBe('Wielki szczur gryzie cie w noge.');
        });

        test.each([
            'Ranisz opalizujacego runicznego wielkiego szczura.',
            'Ranisz czarnego smuklego topora.',
        ])('the ignore list keeps %s unprefixed', (line) => {
            const [out] = client.onLine(line, 'combat.avatar');

            expect(out.text).toBe(line);
        });
    });
});
