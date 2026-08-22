import { describe, test, expect, beforeEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import { LUA_GAGS_STORAGE_KEY, LuaGagDeleteMode } from '@client/luaGagsSettings';
import registerLuaGagTriggers from '@client/scripts/luaGags';
import initCombatStats, { getCombatStats } from '@client/scripts/combatStats';

const DODGE = 'Wielki szczur atakuje cie, lecz zrecznie unikasz ciosu.';
const PARRY = 'Wielki szczur atakuje cie, lecz sprawnie parujesz go i odskakujesz.';

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

function setModes(modes: Partial<Record<string, LuaGagDeleteMode>>) {
    characterStorage.set(LUA_GAGS_STORAGE_KEY, modes as any);
}

describe('luaGags', () => {
    let client: Client;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        initCombatStats(client, { push: () => {} });
        client.sendEvent('reset');
        registerLuaGagTriggers(client);
    });

    describe('mode 2 (prefix) — the default', () => {
        test('a dodge is prefixed and still rendered', () => {
            const parts = client.onLine(DODGE, 'combat.avatar');

            expect(parts).toHaveLength(1);
            expect(parts[0].text).toBe(`[unk] ${DODGE}`);
        });

        test('a parry is prefixed and still rendered', () => {
            const parts = client.onLine(PARRY, 'combat.avatar');

            expect(parts).toHaveLength(1);
            expect(parts[0].text).toBe(`[par] ${PARRY}`);
        });

        test('the prefixed buffer is what later triggers receive', () => {
            // combatWindow clones whatever it is handed, so the prefix has to be
            // on the buffer by the time it runs.
            let seen: string | null = null;
            client.Triggers.registerTrigger(/szczur/, (line) => {
                seen = line.text;
                return line;
            });

            client.onLine(DODGE, 'combat.avatar');

            expect(seen).toBe(`[unk] ${DODGE}`);
        });
    });

    describe('mode 1 (delete)', () => {
        test('a dodge is suppressed entirely', () => {
            setModes({ moje_uniki: 1 });

            expect(client.onLine(DODGE, 'combat.avatar')).toHaveLength(0);
        });

        test('deleting one type leaves the others alone', () => {
            setModes({ moje_uniki: 1 });

            expect(client.onLine(DODGE, 'combat.avatar')).toHaveLength(0);
            expect(client.onLine(PARRY, 'combat.avatar')).toHaveLength(1);
        });

        test('deletion aborts dispatch — later triggers never run', () => {
            // The behaviour stage 0b would change. See docs/SCRIPT_DEPENDENCIES.md.
            setModes({ moje_uniki: 1 });
            let ran = false;
            client.Triggers.registerTrigger(/szczur/, (line) => {
                ran = true;
                return line;
            });

            client.onLine(DODGE, 'combat.avatar');

            expect(ran).toBe(false);
        });
    });

    describe('mode 0 (leave alone)', () => {
        test('the line passes through unprefixed', () => {
            setModes({ moje_uniki: 0 });

            const parts = client.onLine(DODGE, 'combat.avatar');

            expect(parts).toHaveLength(1);
            expect(parts[0].text).toBe(DODGE);
        });
    });

    describe('scope', () => {
        test('non-combat line types are never touched', () => {
            const [out] = client.onLine(DODGE, 'text');

            expect(out.text).toBe(DODGE);
        });

        test('an unrelated combat line passes through', () => {
            const line = 'Rozgladasz sie dookola pola bitwy.';
            const [out] = client.onLine(line, 'combat.avatar');

            expect(out.text).toBe(line);
        });
    });

    // The one real import edge from luaGags: it calls recordCombatStat directly.
    // docs/SCRIPT_DEPENDENCIES.md proposes inverting this into an event.
    describe('feeding combatStats', () => {
        test('a dodge is recorded', () => {
            client.onLine(DODGE, 'combat.avatar');

            const s = getCombatStats();
            expect(s.unikniete).toBe(1);
            expect(s.total).toBe(1);
        });

        test('a parry is recorded', () => {
            client.onLine(PARRY, 'combat.avatar');

            expect(getCombatStats().wyparowane.count).toBe(1);
        });

        test('stats are recorded even when the line is deleted', () => {
            // A gagged dodge is still a dodge. This must stay true after stage 0b.
            setModes({ moje_uniki: 1 });

            expect(client.onLine(DODGE, 'combat.avatar')).toHaveLength(0);
            expect(getCombatStats().unikniete).toBe(1);
        });

        test('stats are recorded even when the line is left unprefixed', () => {
            setModes({ moje_uniki: 0 });

            client.onLine(DODGE, 'combat.avatar');

            expect(getCombatStats().unikniete).toBe(1);
        });
    });
});
