import { describe, test, expect, beforeEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import { LUA_GAGS_STORAGE_KEY, LuaGagDeleteMode } from '@client/luaGagsSettings';
import registerGagTriggers from '@client/scripts/gags';
import initCombatWindow, {
    getCombatHistory,
    getCombatRedirectSettings,
    setCombatRedirectSetting,
    type CombatMessageType,
} from '@client/scripts/combatWindow';

const COMBAT_TYPES: CombatMessageType[] = ['combat.avatar', 'combat.team', 'combat.others'];

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

function setOwnHitsMode(mode: LuaGagDeleteMode) {
    characterStorage.set(LUA_GAGS_STORAGE_KEY, { moje_ciosy: mode } as any);
}

/** History and redirect settings are module-level singletons — reset both. */
function resetCombatWindow(client: Client) {
    COMBAT_TYPES.forEach(t => setCombatRedirectSetting(t, false));
    client.sendEvent('client.disconnect');
}

function texts() {
    return getCombatHistory()
        .filter(e => e.type !== 'separator')
        .map(e => (e as { buffer: { text: string } }).buffer.text);
}

describe('combatWindow', () => {
    let client: Client;

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        initCombatWindow(client, []);
        resetCombatWindow(client);
    });

    describe('redirection off (the default)', () => {
        test('nothing is captured and the line renders normally', () => {
            expect(getCombatRedirectSettings()).toEqual({
                'combat.avatar': false,
                'combat.team': false,
                'combat.others': false,
            });

            const parts = client.onLine('Wielki szczur gryzie cie w noge.', 'combat.avatar');

            expect(parts).toHaveLength(1);
            expect(texts()).toEqual([]);
        });
    });

    describe('redirection on', () => {
        beforeEach(() => setCombatRedirectSetting('combat.avatar', true));

        test('the line is captured and kept out of the main window', () => {
            const parts = client.onLine('Wielki szczur gryzie cie w noge.', 'combat.avatar');

            expect(parts).toHaveLength(0);
            expect(texts()).toEqual(['Wielki szczur gryzie cie w noge.']);
        });

        test('only the redirected type is captured', () => {
            client.onLine('Trafiony przez sojusznika.', 'combat.team');
            client.onLine('Wielki szczur gryzie cie w noge.', 'combat.avatar');

            expect(texts()).toEqual(['Wielki szczur gryzie cie w noge.']);
        });

        test('non-combat output is untouched', () => {
            const parts = client.onLine('Jestes lekko zmeczony.', 'text');

            expect(parts).toHaveLength(1);
            expect(texts()).toEqual([]);
        });

        test('a room change inserts a separator, but only once', () => {
            client.onLine('Wielki szczur gryzie cie w noge.', 'combat.avatar');
            client.sendEvent('gmcp.room.info', {} as any);
            client.sendEvent('gmcp.room.info', {} as any);

            const separators = getCombatHistory().filter(e => e.type === 'separator');
            expect(separators).toHaveLength(1);
        });

        test('disconnect clears the history', () => {
            client.onLine('Wielki szczur gryzie cie w noge.', 'combat.avatar');
            expect(texts()).toHaveLength(1);

            client.sendEvent('client.disconnect');

            expect(getCombatHistory()).toEqual([]);
        });
    });

    // The reason combatWindow must run AFTER the gags, and the behaviour that
    // stage 0b must preserve. See docs/SCRIPT_DEPENDENCIES.md —
    // "Should suppression stop dispatch?".
    describe('interaction with the gags', () => {
        beforeEach(() => {
            // A FRESH client: registration order has to mirror registerScripts()
            // exactly — gags(116) before combatWindow(118). Reusing the outer
            // client would leave its combatWindow trigger registered *before* the
            // gags, and that earlier trigger captures the raw line first. Which is
            // itself the point: today this behaviour is decided purely by position.
            client = createClient();
            registerGagTriggers(client);
            initCombatWindow(client, []);
            resetCombatWindow(client);
            setCombatRedirectSetting('combat.avatar', true);
        });

        test('gag mode 2: the captured line carries the prefix, as the main window would have shown it', () => {
            setOwnHitsMode(2);

            const parts = client.onLine('Ranisz wielkiego szczura.', 'combat.avatar');

            expect(parts).toHaveLength(0);
            expect(texts()).toEqual(['[3/6] Ranisz wielkiego szczura.']);
        });

        test('gag mode 1: the line is shown nowhere — not even in the combat window', () => {
            setOwnHitsMode(1);

            const parts = client.onLine('Ranisz wielkiego szczura.', 'combat.avatar');

            expect(parts).toHaveLength(0);
            expect(texts()).toEqual([]);
        });

        test('gag mode 0: the untouched line is still captured', () => {
            setOwnHitsMode(0);

            client.onLine('Ranisz wielkiego szczura.', 'combat.avatar');

            expect(texts()).toEqual(['Ranisz wielkiego szczura.']);
        });

        test('a combat line the gags ignore is captured verbatim', () => {
            setOwnHitsMode(1);

            client.onLine('Wielki szczur gryzie cie w noge.', 'combat.avatar');

            expect(texts()).toEqual(['Wielki szczur gryzie cie w noge.']);
        });
    });
});
