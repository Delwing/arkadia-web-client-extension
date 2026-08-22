import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    waitForCommandInput,
    pushGmcp,
    primeCharInfo,
    GMCP_PATHS,
    getCommandLog,
    resetCommandLog,
    submitCommand,
} from './support/mocks';
import type {Page} from '@playwright/test';

/**
 * Object nums used in these tests — must not collide with other spec files.
 * client-movement.spec.ts uses 80010–80013.
 * character-switch-data.spec.ts uses 70001–70013.
 * We use 90001–90010.
 */
const ALLY_OBJECT_NUM = 90001;
const NON_ALLY_OBJECT_NUM = 90002;
const ALLY_LEADER_NUM = 90003;

/** Name exactly as it appears in the mock people DB (guild 1 = CKN). */
const ALLY_NAME = 'Aldous';

/** Name of a person in the mock DB that is NOT in CKN (guild 8 = SGW). */
const NON_ALLY_NAME = 'Berenika';


/**
 * Press Ctrl+1 (attackBind) once.
 * The #message-input must have focus so keydown reaches the window listener.
 */
async function pressAttackBind(page: Page): Promise<void> {
    await page.locator('#message-input').focus();
    await page.keyboard.down('Control');
    await page.keyboard.down('Digit1');
    await page.keyboard.up('Digit1');
    await page.keyboard.up('Control');
}

/**
 * Press Ctrl+Q (supportBind) once.
 */
async function pressSupportBind(page: Page): Promise<void> {
    await page.locator('#message-input').focus();
    await page.keyboard.down('Control');
    await page.keyboard.down('KeyQ');
    await page.keyboard.up('KeyQ');
    await page.keyboard.up('Control');
}

/**
 * Set allyGuilds in localStorage for the given character AFTER the page has
 * loaded (so characterStorage.onChange fires).
 */
async function setAllyGuilds(
    page: Page,
    charName: string,
    allyGuilds: string[],
): Promise<void> {
    await page.evaluate(
        ([name, guilds]) => {
            const key = `${name}:settings`;
            const existing = JSON.parse(localStorage.getItem(key) ?? '{}');
            existing.allyGuilds = guilds;
            localStorage.setItem(key, JSON.stringify(existing));
            // Dispatch a storage event so characterStorage.onChange listeners fire
            window.dispatchEvent(
                new StorageEvent('storage', {
                    key,
                    newValue: JSON.stringify(existing),
                    storageArea: localStorage,
                }),
            );
        },
        [charName, allyGuilds] as [string, string[]],
    );
    // Allow onChange to propagate and rebuildAllySet to run
    await page.waitForFunction(
        ([name, guilds]) => {
            const key = `${name}:settings`;
            const raw = localStorage.getItem(key);
            if (!raw) return false;
            try {
                const parsed = JSON.parse(raw);
                return JSON.stringify(parsed.allyGuilds) === JSON.stringify(guilds);
            } catch { return false; }
        },
        [charName, allyGuilds] as [string, string[]],
        {timeout: 5000},
    );
}

/**
 * Push an objects.data packet that marks the given object as the attack target
 * with the given description (player name). Also pushes objects.nums so that
 * ObjectManager.getObjectsOnLocation() can find the object — this is needed
 * because allyProtection.ts uses the fallback checkAndCacheObject path which
 * queries getObjectsOnLocation() when the gmcp.objects.data cache-fill fails.
 * Optionally register a team leader.
 */
async function setAttackTarget(
    page: Page,
    objectNum: number,
    description: string,
    options: {leaderId?: number} = {},
): Promise<void> {
    const data: Record<string, unknown> = {
        [String(objectNum)]: {
            desc: description,
            attack_target: true,
            defense_target: false,
            living: true,
            team: false,
            team_leader: false,
            attack_num: false,
            hp: 100,
        },
    };

    const nums: number[] = [objectNum];

    if (options.leaderId !== undefined) {
        data[String(options.leaderId)] = {
            desc: 'TeamLeader',
            team: true,
            team_leader: true,
            attack_num: false,
        };
        nums.push(options.leaderId);
    }

    // Push objects.nums first so ObjectManager has the num list before the data arrives
    await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, nums);
    await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, data);
    // Allow ally cache / fallback to be populated from the events
    await page.waitForTimeout(200);
}

/**
 * Navigate to the app and wait for the people DB download to complete, which
 * signals that the Worker has successfully fetched and is about to parse the
 * SQLite data. We then wait for the async pipeline to finish:
 *   fetch → sql.js parse → postMessage → DataStore → IDB write → subscribeMerged → rebuildAllySet
 *
 * The response promise must be started BEFORE page.goto so that Playwright's
 * request interception can catch the Worker's fetch call.
 */
async function gotoAndWaitForPeopleDB(page: Page): Promise<void> {
    // Start listening BEFORE navigation so the request isn't missed
    const responsePromise = page.waitForResponse(
        (response) => response.url().includes('arkadia-people.delwing.workers.dev'),
        {timeout: 20000},
    );

    await page.goto('/');

    // Wait for the HTTP response to be delivered to the Worker
    await responsePromise;

    // The Worker still needs to: parse the ArrayBuffer via sql.js (WASM), then
    // postMessage back. DataStore then writes to IndexedDB. subscribeMerged fires.
    // allyProtection rebuilds ally descriptions. No observable signal exists for
    // the full pipeline, so we wait for the response + a generous settle time.
    await page.waitForTimeout(3000);
}

test.describe('Ally protection system', () => {
    test.describe.configure({ timeout: 20000 });
    test.beforeEach(async ({page}) => {
        // Navigate and wait for the people DB to load end-to-end
        await gotoAndWaitForPeopleDB(page);

        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Prime char info so characterStorage.currentCharacter = 'Tester'
        await primeCharInfo(page, {name: 'Tester'});

        // Wait for the character to be registered
        await page.waitForFunction(
            () => localStorage.getItem('currentCharacter') === 'Tester',
            {timeout: 5000},
        );

        // Configure allyGuilds = ['CKN'] and wait for the ally set to rebuild
        await setAllyGuilds(page, 'Tester', ['CKN']);
    });

    test('first Ctrl+1 on ally shows [UWAGA] warning and sends no command', async ({page}) => {
        await setAttackTarget(page, ALLY_OBJECT_NUM, ALLY_NAME);

        const output = page.locator('#main_text_output_msg_wrapper');
        await resetCommandLog(page);

        await pressAttackBind(page);

        // Warning message must appear with ally name and guild
        await expect(output).toContainText('[UWAGA]');
        await expect(output).toContainText(ALLY_NAME);
        await expect(output).toContainText('CKN');

        // wait briefly to confirm no command was dispatched
        await page.waitForTimeout(200);
        const log = await getCommandLog(page);
        expect(log, 'no command should be sent on first press against ally').toHaveLength(0);
    });

    test('second Ctrl+1 within 5s confirms and sends attack command', async ({page}) => {
        await setAttackTarget(page, ALLY_OBJECT_NUM, ALLY_NAME);

        const output = page.locator('#main_text_output_msg_wrapper');
        await resetCommandLog(page);

        // First press — warning
        await pressAttackBind(page);
        await expect(output).toContainText('[UWAGA]');

        // Second press within 5s — should confirm and send the attack command
        await resetCommandLog(page);
        await pressAttackBind(page);

        await expect
            .poll(
                async () => await getCommandLog(page),
                {
                    message: 'attack command should be sent on second press within 5s',
                    timeout: 3000,
                },
            )
            .toContainEqual(expect.stringContaining(`ob_${ALLY_OBJECT_NUM}`));
    });

    test('timeout of 5s resets pending attack — warning shown again after expiry', async ({page}) => {
        await setAttackTarget(page, ALLY_OBJECT_NUM, ALLY_NAME);

        const output = page.locator('#main_text_output_msg_wrapper');

        // First press — warning, sets pending attack
        await resetCommandLog(page);
        await pressAttackBind(page);
        await expect(output).toContainText('[UWAGA]');

        // Wait past the 5s confirmation window using real wait since
        // page.clock cannot be installed after page.goto in beforeEach
        await page.waitForTimeout(5500);

        // Second press after timeout — must show the warning again, not confirm
        await resetCommandLog(page);
        await pressAttackBind(page);
        await expect(output).toContainText('[UWAGA]');

        // wait briefly to confirm no command was dispatched
        await page.waitForTimeout(200);
        const log = await getCommandLog(page);
        expect(log, 'no attack command should be sent after timeout').toHaveLength(0);
    });

    // Support is deliberately not gated. It is not an attack on the ally: it sends
    // `wesprzyj` at the team leader, and the old gate inferred the ally from the
    // team's current attack target rather than from the command. Ally protection
    // is now a command hook on the attack command, so support goes straight out.
    test('support bind (Ctrl+Q) is not gated, even with an ally targeted', async ({page}) => {
        await setAttackTarget(page, ALLY_OBJECT_NUM, ALLY_NAME, {leaderId: ALLY_LEADER_NUM});

        const output = page.locator('#main_text_output_msg_wrapper');
        await resetCommandLog(page);

        await pressSupportBind(page);

        await expect
            .poll(
                async () => await getCommandLog(page),
                {message: 'wesprzyj should be sent on the first press', timeout: 3000},
            )
            .toContainEqual('wesprzyj');

        await expect(output, 'no ally warning for a support command').not.toContainText('[UWAGA]');
    });

    // The gate sits on the outgoing command, so a hand-typed attack is protected
    // too — it was not before, when only the attack bind consulted it.
    test('a hand-typed attack command on an ally is gated', async ({page}) => {
        await setAttackTarget(page, ALLY_OBJECT_NUM, ALLY_NAME);

        const output = page.locator('#main_text_output_msg_wrapper');
        await resetCommandLog(page);

        await submitCommand(page, `zabij ob_${ALLY_OBJECT_NUM}`);

        await expect(output).toContainText('[UWAGA]');
        await page.waitForTimeout(200);
        expect(
            await getCommandLog(page),
            'a typed attack on an ally should not reach the game',
        ).toHaveLength(0);

        await resetCommandLog(page);
        await submitCommand(page, `zabij ob_${ALLY_OBJECT_NUM}`);

        await expect
            .poll(
                async () => await getCommandLog(page),
                {message: 'repeating it confirms', timeout: 3000},
            )
            .toContainEqual(expect.stringContaining(`ob_${ALLY_OBJECT_NUM}`));
    });

    test('room change clears pending attack — [UWAGA] shown again after room change', async ({page}) => {
        await setAttackTarget(page, ALLY_OBJECT_NUM, ALLY_NAME);

        const output = page.locator('#main_text_output_msg_wrapper');
        await resetCommandLog(page);

        // First press — warning, sets pendingAttack
        await pressAttackBind(page);
        await expect(output).toContainText('[UWAGA]');

        // Simulate a room change — clears both allyCache and pendingAttack
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 99901,
            name: 'Nowe miejsce',
            exits: {},
            area: 'Test',
        });

        // Re-push objects data so the ally cache can be rebuilt for the new room
        await setAttackTarget(page, ALLY_OBJECT_NUM, ALLY_NAME);

        // Second press — must show warning AGAIN because pendingAttack was cleared
        await resetCommandLog(page);
        await pressAttackBind(page);
        await expect(output).toContainText('[UWAGA]');

        // wait briefly to confirm no command was dispatched
        await page.waitForTimeout(200);
        const log = await getCommandLog(page);
        expect(log, 'no attack command after room-change reset of pending').toHaveLength(0);
    });

    test('Ctrl+1 on non-ally sends attack command immediately without warning', async ({page}) => {
        // Berenika is SGW, not CKN — so she is not an ally
        await setAttackTarget(page, NON_ALLY_OBJECT_NUM, NON_ALLY_NAME);
        await resetCommandLog(page);

        await pressAttackBind(page);

        await expect
            .poll(
                async () => await getCommandLog(page),
                {
                    message: 'attack command should be sent immediately for non-ally target',
                    timeout: 3000,
                },
            )
            .toContainEqual(expect.stringContaining(`ob_${NON_ALLY_OBJECT_NUM}`));

        const output = page.locator('#main_text_output_msg_wrapper');
        // [UWAGA] must NOT appear for a non-ally
        await expect(output).not.toContainText('[UWAGA]');
    });
});
