import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    GMCP_PATHS,
    pushGmcp,
    pushText,
    waitForCommandInput,
} from './support/mocks';

// Actual game line that matches the "innych_spece" granite hammer trigger:
// ^(?<attacker>\w+(?: \w+){0,4}) bierze ogromny zamach swoim gigantycznym granitowym mlotem
// i wyprowadza potworny cios w glowe (?<target>.+?)\. Przeciwnik mruga oczami,
// nie bardzo wiedzac, co sie dzieje\. Porzadnie (?:go|ja) zamroczylo\.$
function granitHammerStunLine(attacker: string, target: string) {
    return `${attacker} bierze ogromny zamach swoim gigantycznym granitowym mlotem i wyprowadza potworny cios w glowe ${target}. Przeciwnik mruga oczami, nie bardzo wiedzac, co sie dzieje. Porzadnie ja zamroczylo.`;
}

async function setupObjects(
    page: import('@playwright/test').Page,
    charInfo: Record<string, unknown>,
    objectsData: Record<string, Record<string, unknown>>,
    nums: number[],
) {
    await pushGmcp(page, GMCP_PATHS.CHAR_INFO, charInfo);
    await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, objectsData);
    await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, nums);
}

function hasStunHighlight(el: Element): boolean {
    const inner = el.querySelector('span[style*="background-color"]');
    return inner !== null;
}

test.describe('Enemy stun marking', () => {
    test('marks stunned enemy with inverted colors', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await setupObjects(page,
            {name: 'Hero', object_num: 100},
            {
                '100': {desc: 'Hero', team: true, team_leader: true},
                '200': {desc: 'prymitywna masywna bestia', attack_num: false},
            },
            [100, 200],
        );

        const objectDesc = page.locator('#objects-list .object-desc[data-object-id="200"]');
        await expect(objectDesc).toBeVisible();

        // Send actual game line that triggers stun via the granite hammer trigger
        await pushText(page, granitHammerStunLine('Khurg', 'prymitywnej masywnej bestii'), {type: 'combat.others'});

        // Verify the enemy gets stun highlight (background-color applied)
        await expect.poll(async () => {
            return await objectDesc.evaluate(hasStunHighlight);
        }, {message: 'should have stun highlight style'}).toBe(true);
    });

    test('marks correct enemy when stale object with same desc exists', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Setup initial objects - first encounter with the beast
        await setupObjects(page,
            {name: 'Hero', object_num: 100},
            {
                '100': {desc: 'Hero', team: true, team_leader: true},
                '500': {desc: 'prymitywna masywna bestia', attack_num: false},
            },
            [100, 500],
        );

        const firstBeast = page.locator('#objects-list .object-desc[data-object-id="500"]');
        await expect(firstBeast).toBeVisible();

        // Simulate moving to a new location - beast #500 is no longer present
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [100]);

        // New encounter - same desc, different num
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '600': {desc: 'prymitywna masywna bestia', attack_num: false},
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [100, 600]);

        const secondBeast = page.locator('#objects-list .object-desc[data-object-id="600"]');
        await expect(secondBeast).toBeVisible();

        // Send actual game line that triggers stun
        await pushText(page, granitHammerStunLine('Khurg', 'prymitywnej masywnej bestii'), {type: 'combat.others'});

        // Verify the CURRENT beast (600) gets the stun highlight
        await expect.poll(async () => {
            return await secondBeast.evaluate(hasStunHighlight);
        }, {message: 'current beast should have stun highlight'}).toBe(true);
    });

    test('stun marking expires after timeout', async ({page}) => {
        await page.clock.install();

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await setupObjects(page,
            {name: 'Hero', object_num: 100},
            {
                '100': {desc: 'Hero', team: true, team_leader: true},
                '300': {desc: 'wielki troll', attack_num: false},
            },
            [100, 300],
        );

        const objectDesc = page.locator('#objects-list .object-desc[data-object-id="300"]');
        await expect(objectDesc).toBeVisible();

        await pushText(page, granitHammerStunLine('Khurg', 'wielkiego trolla'), {type: 'combat.others'});

        // Verify stun is applied
        await expect.poll(async () => {
            return await objectDesc.evaluate(hasStunHighlight);
        }, {message: 'should have stun highlight'}).toBe(true);

        // Advance fake clock past the 15s stun timeout
        await page.clock.runFor(16000);

        // Trigger a re-render by sending new objects data
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '300': {desc: 'wielki troll', attack_num: false},
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [100, 300]);

        // Verify stun highlight is removed
        await expect.poll(async () => {
            return await objectDesc.evaluate(hasStunHighlight);
        }, {
            message: 'stun highlight should be removed after timeout',
            timeout: 5000,
        }).toBe(false);
    });

    test('multiple enemies can be stunned independently', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await setupObjects(page,
            {name: 'Hero', object_num: 100},
            {
                '100': {desc: 'Hero', team: true, team_leader: true},
                '401': {desc: 'prymitywna masywna bestia', attack_num: false},
                '402': {desc: 'wielki troll', attack_num: false},
            },
            [100, 401, 402],
        );

        const beast = page.locator('#objects-list .object-desc[data-object-id="401"]');
        const troll = page.locator('#objects-list .object-desc[data-object-id="402"]');
        await expect(beast).toBeVisible();
        await expect(troll).toBeVisible();

        // Stun only the beast
        await pushText(page, granitHammerStunLine('Khurg', 'prymitywnej masywnej bestii'), {type: 'combat.others'});

        // Beast should be highlighted
        await expect.poll(async () => {
            return await beast.evaluate(hasStunHighlight);
        }, {message: 'beast should have stun highlight'}).toBe(true);

        // Troll should NOT be highlighted
        const trollHasHighlight = await troll.evaluate(hasStunHighlight);
        expect(trollHasHighlight, 'troll should not have stun highlight').toBe(false);

        // Now stun the troll too
        await pushText(page, granitHammerStunLine('Khurg', 'wielkiego trolla'), {type: 'combat.others'});

        // Both should be highlighted
        await expect.poll(async () => {
            return await troll.evaluate(hasStunHighlight);
        }, {message: 'troll should now have stun highlight'}).toBe(true);

        const beastStillHighlighted = await beast.evaluate(hasStunHighlight);
        expect(beastStillHighlighted, 'beast should still have stun highlight').toBe(true);
    });
});
