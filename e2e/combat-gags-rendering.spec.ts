import { expect, test } from './support/fixtures';
import type { Page } from '@playwright/test';
import {
    ensureGameSocket,
    getRecentOutput,
    GMCP_PATHS,
    pushGmcp,
    pushText,
    submitCommand,
    waitForCharacter,
    waitForCommandInput,
    waitForOutputContaining,
} from './support/mocks';
import { setGagMode } from './support/options';

/**
 * What the unit tests cannot reach: the render boundary.
 *
 * `Triggers.parseLine` returning null is covered in
 * test/client/scripts/{gags,luaGags,combatWindow}.test.ts, but only end-to-end can
 * show that a suppressed line never reaches the DOM, that a prefixed one renders its
 * prefix, and that the combat window shows the line exactly as the main window would
 * have. See docs/SCRIPT_DEPENDENCIES.md — "Should suppression stop dispatch?".
 */

const OUTPUT = '#main_text_output_msg_wrapper';
const COMBAT_POPUP = '.combat-popup';

// "Ranisz" is power 3 of 6 in gags.ts, so mode 2 prefixes it with "[3/6] ".
const OWN_HIT = 'Ranisz wielkiego szczura.';
const OWN_HIT_PREFIX = '[3/6]';
// A line the gags never touch, used as a fence to prove output kept flowing.
const MARKER = 'Rozgladasz sie dookola placu.';

async function login(page: Page, name: string) {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, GMCP_PATHS.CHAR_INFO, { name });
    await waitForCharacter(page, name);
}

/**
 * Push a combat line, then a marker the gags ignore. Once the marker has rendered
 * the pipeline has certainly finished with the combat line, so asserting the combat
 * line's absence is safe rather than a race.
 */
async function pushHitThenMarker(page: Page, line = OWN_HIT) {
    await pushText(page, line, { type: 'combat.avatar' });
    await pushText(page, MARKER);
    await waitForOutputContaining(page, 'Rozgladasz sie');
}

test.describe('combat gag rendering', () => {
    test('mode 2 renders the power prefix in the main output', async ({ page }) => {
        await login(page, 'PrefixRender');
        await setGagMode(page, 'moje_ciosy', '2');

        await pushHitThenMarker(page);

        const output = await getRecentOutput(page, 10);
        expect(output, 'the hit should still be shown').toContain('wielkiego szczura');
        expect(output, 'and it should carry the power prefix').toContain(OWN_HIT_PREFIX);
    });

    test('mode 1 keeps the line out of the main output entirely', async ({ page }) => {
        await login(page, 'DeleteRender');
        await setGagMode(page, 'moje_ciosy', '1');

        await pushHitThenMarker(page);

        const output = await getRecentOutput(page, 10);
        expect(output, 'the marker proves output kept flowing').toContain('Rozgladasz sie');
        expect(output, 'the gagged hit must not be rendered').not.toContain('wielkiego szczura');
        expect(output, 'and no prefix should leak either').not.toContain(OWN_HIT_PREFIX);
    });

    test('mode 0 renders the line untouched', async ({ page }) => {
        await login(page, 'KeepRender');
        await setGagMode(page, 'moje_ciosy', '0');

        await pushHitThenMarker(page);

        const output = await getRecentOutput(page, 10);
        expect(output).toContain('wielkiego szczura');
        expect(output, 'no prefix in keep mode').not.toContain(OWN_HIT_PREFIX);
    });
});

test.describe('combat window redirection', () => {
    /** Opening the popup is what enables redirection for all three combat types. */
    async function openCombatWindow(page: Page) {
        await submitCommand(page, '/walkaw');
        const popup = page.locator(COMBAT_POPUP);
        await expect(popup, 'should open the combat window').toBeVisible();
        return popup;
    }

    test('a redirected hit reaches the combat window and leaves the main output', async ({ page }) => {
        await login(page, 'RedirectRender');
        await setGagMode(page, 'moje_ciosy', '2');
        const popup = await openCombatWindow(page);

        await pushHitThenMarker(page);

        // The whole point: the combat window shows it prefixed and coloured, exactly
        // as the main window would have.
        await expect(popup.locator('.combat-popup__message'), 'combat window shows the hit')
            .toContainText('wielkiego szczura');
        await expect(popup, 'and it carries the gag prefix').toContainText(OWN_HIT_PREFIX);

        const output = await getRecentOutput(page, 10);
        expect(output, 'the marker still renders in the main output').toContain('Rozgladasz sie');
        expect(output, 'but the redirected hit does not').not.toContain('wielkiego szczura');
    });

    test('a gagged hit reaches neither window', async ({ page }) => {
        await login(page, 'GagBeatsRedirect');
        await setGagMode(page, 'moje_ciosy', '1');
        const popup = await openCombatWindow(page);

        await pushHitThenMarker(page);

        await expect(popup, 'a gag means gone everywhere, combat window included')
            .not.toContainText('wielkiego szczura');

        const output = await getRecentOutput(page, 10);
        expect(output).toContain('Rozgladasz sie');
        expect(output).not.toContain('wielkiego szczura');
    });

    test('a combat line the gags ignore is still redirected', async ({ page }) => {
        await login(page, 'PlainRedirect');
        const popup = await openCombatWindow(page);

        await pushText(page, 'Wielki szczur gryzie cie w noge.', { type: 'combat.avatar' });
        await pushText(page, MARKER);
        await waitForOutputContaining(page, 'Rozgladasz sie');

        await expect(popup.locator('.combat-popup__message')).toContainText('gryzie cie w noge');

        const output = await getRecentOutput(page, 10);
        expect(output).not.toContain('gryzie cie w noge');
    });

    test('without the combat window open, combat lines stay in the main output', async ({ page }) => {
        await login(page, 'NoRedirect');

        await pushText(page, 'Wielki szczur gryzie cie w noge.', { type: 'combat.avatar' });
        await waitForOutputContaining(page, 'gryzie cie w noge');

        const output = await getRecentOutput(page, 10);
        expect(output).toContain('gryzie cie w noge');
    });
});
