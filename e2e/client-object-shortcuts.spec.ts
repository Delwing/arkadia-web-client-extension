import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getLastOutgoingCommand,
    GMCP_PATHS,
    pushGmcp,
    pushText,
    submitCommand,
    waitForCommandInput,
    waitForOutputContaining,
} from './support/mocks';

/**
 * Tests for @<shortcut> expansion in user commands (Client.ts expandObjectShortcuts).
 *
 * ObjectManager assigns shortcuts in default 'letters' mode:
 *   - player          → @
 *   - teammates       → A, B, C... (letter shortcuts, persisted per session)
 *   - enemies (combat) → 1, 2, 3... (objects with attack_num truthy)
 *   - non-combat rest → 50+ when in combat, else 1, 2... (attack_num: false or undefined)
 *
 * The regex /@([A-Za-z0-9@]+)/g in expandObjectShortcuts matches @<token> and
 * replaces it with ob_<num> using a case-insensitive shortcut lookup.
 */

test.describe('@shortcut command expansion', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
    });

    test('@1 expands to enemy object number', async ({page}) => {
        // Player (100) is team_leader; enemy (101) has attack_num truthy so it is
        // categorised as combatRest and receives shortcut '1'.
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Hero', object_num: 100});
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '100': {desc: 'Hero', team: true, team_leader: true},
            '101': {desc: 'Goblin', attack_num: 1},
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [100, 101]);

        await page.evaluate(() => (window as any).__resetCommandLog?.());
        await submitCommand(page, 'zabij @1');

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'should expand @1 to the enemy object number',
                timeout: 5000,
            })
            .toBe('zabij ob_101');
    });

    test('@A expands to teammate object number', async ({page}) => {
        // Player (200) is team_leader; teammate (202, team: true) receives shortcut 'A';
        // enemy (201) is in combat and gets shortcut '1'.
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Hero', object_num: 200});
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '200': {desc: 'Hero', team: true, team_leader: true},
            '201': {desc: 'Goblin', attack_num: 1},
            '202': {desc: 'Ally Fighter', team: true},
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [200, 201, 202]);

        await page.evaluate(() => (window as any).__resetCommandLog?.());
        await submitCommand(page, 'obejrzyj @A');

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'should expand @A to the teammate object number',
                timeout: 5000,
            })
            .toBe('obejrzyj ob_202');
    });

    test('@@ expands to player object number', async ({page}) => {
        // Player (300) gets shortcut '@'. The regex captures '@' after the leading '@',
        // which matches the player shortcut via case-insensitive comparison.
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Hero', object_num: 300});
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '300': {desc: 'Hero', team: true, team_leader: true},
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [300]);

        await page.evaluate(() => (window as any).__resetCommandLog?.());
        await submitCommand(page, 'obejrzyj @@');

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'should expand @@ to the player object number',
                timeout: 5000,
            })
            .toBe('obejrzyj ob_300');
    });

    test('unknown shortcut is left unchanged in the command', async ({page}) => {
        // @xyz does not match any assigned shortcut and must pass through as-is.
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Hero', object_num: 400});
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '400': {desc: 'Hero', team: true, team_leader: true},
            '401': {desc: 'Goblin', attack_num: 1},
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [400, 401]);

        await page.evaluate(() => (window as any).__resetCommandLog?.());
        await submitCommand(page, 'test @xyz');

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'should leave unknown @xyz shortcut unchanged',
                timeout: 5000,
            })
            .toBe('test @xyz');
    });

    test('multiple shortcuts in one command are each expanded', async ({page}) => {
        // @1 → ob_501 (first combat enemy), @2 → ob_502 (second combat enemy).
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Hero', object_num: 500});
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '500': {desc: 'Hero', team: true, team_leader: true},
            '501': {desc: 'Goblin', attack_num: 1},
            '502': {desc: 'Orc', attack_num: 1},
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [500, 501, 502]);

        await page.evaluate(() => (window as any).__resetCommandLog?.());
        await submitCommand(page, 'porownaj @1 z @2');

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'should expand both @1 and @2 shortcuts in a single command',
                timeout: 5000,
            })
            .toBe('porownaj ob_501 z ob_502');
    });

    // A scroll or przeobrazenie rebuilds the character in place and gives it a new
    // object id, without the server necessarily saying so over Char.Info. The old id
    // simply leaves the room and an unfamiliar one takes its place, which is enough
    // to work out which one we became.
    test('@ follows the player through a change of appearance', async ({page}) => {
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Hero', object_num: 700});
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '700': {desc: 'Hero'},
            '701': {desc: 'Goblin', attack_num: 1},
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [700, 701]);

        await page.evaluate(() => (window as any).__resetCommandLog?.());
        await submitCommand(page, 'obejrzyj @@');
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {timeout: 5000})
            .toBe('obejrzyj ob_700');

        await pushText(page, 'Twoja twarz oblewa wpierw fala goraca, a pozniej niezwyklego chlodu. Wszystko to po chwili jednak mija. Czujesz jednak, ze cos sie zmienilo...');
        await waitForOutputContaining(page, 'cos sie zmienilo');

        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {'799': {desc: 'Ktos obcy'}});
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [799, 701]);

        await page.evaluate(() => (window as any).__resetCommandLog?.());
        await submitCommand(page, 'obejrzyj @@');
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: '@ should point at the body the player was rebuilt into',
                timeout: 5000,
            })
            .toBe('obejrzyj ob_799');
    });

    test('shortcut matching is case-insensitive (@a expands same as @A)', async ({page}) => {
        // Teammate (602) receives shortcut 'A'. Submitting @a (lowercase) should also
        // expand because the lookup uses toLowerCase() on both sides.
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Hero', object_num: 600});
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '600': {desc: 'Hero', team: true, team_leader: true},
            '601': {desc: 'Goblin', attack_num: 1},
            '602': {desc: 'Ally Fighter', team: true},
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [600, 601, 602]);

        await page.evaluate(() => (window as any).__resetCommandLog?.());
        await submitCommand(page, 'obejrzyj @a');

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'lowercase @a should expand identically to uppercase @A',
                timeout: 5000,
            })
            .toBe('obejrzyj ob_602');
    });
});
