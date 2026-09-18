import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    pushGmcp,
    pushText,
    submitCommand,
    waitForCommandInput,
    GMCP_PATHS,
} from './support/mocks';

/**
 * Object nums used here - must not collide with other spec files.
 * client-ally-protection.spec.ts uses 90001-90010, client-movement 80010-80013,
 * character-switch-data 70001-70013. We use 91001-91003.
 */
const PLAYER_NUM = 91001;
const COVERER_NUM = 91002;
const COVERED_NUM = 91003;

const COVERER_DESC = 'grozny porywczy zolnierz';
const COVERED_DESC = 'zreczny ogromny zolnierz';

/** pushText takes ASCII-folded Polish - gmcp_msgs text is a Latin-1 byte string. */
const COVER_LINE =
    'Grozny porywczy zolnierz zrecznie zaslania zrecznego ogromnego zolnierza przed twoimi ciosami.';

test.describe('Cover tracker', () => {
    test('tracks a cover from the game line and shows it in the debug popup', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Tester', object_num: PLAYER_NUM});
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [PLAYER_NUM, COVERER_NUM, COVERED_NUM]);
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            [COVERER_NUM]: {
                desc: COVERER_DESC, living: true, team: false, enemy: true, hp: 6,
                attack_num: PLAYER_NUM,
            },
            [COVERED_NUM]: {
                desc: COVERED_DESC, living: true, team: false, enemy: true, hp: 6,
                attack_num: PLAYER_NUM,
            },
            [PLAYER_NUM]: {attack_num: COVERED_NUM, hp: 6},
        });

        await pushText(page, COVER_LINE, {type: 'other'});

        await submitCommand(page, '/zaslony');
        const popup = page.locator('.cover-dbg-popup');
        await expect(popup).toBeVisible();

        // Rows are matched on the num cell: both parties' descs appear in each
        // other's status text, so filtering on a desc matches two rows.
        const row = (num: number) => popup.locator('tbody tr', {hasText: `ob_${num}`});

        // Top pane: the covered mob is blocked, and it is blocked for US.
        const coveredRow = row(COVERED_NUM);
        await expect(coveredRow).toHaveCount(1);
        await expect(coveredRow).toContainText(COVERED_DESC);
        await expect(coveredRow.locator('.cover-dbg-blocked')).toHaveText('ZASLONIETY');
        await expect(coveredRow).toContainText(COVERER_DESC);
        // The "przed kim" column is the point of the popup: the player is on it.
        await expect(coveredRow.locator('.cover-dbg-me')).toHaveText('ty');

        // The coverer's own row reads from the other side of the same edge.
        await expect(row(COVERER_NUM)).toContainText('zaslania');

        // Bottom pane: one log line, with the raw game line underneath it.
        const entries = popup.locator('.cover-dbg-log-entry');
        await expect(entries).toHaveCount(1);
        await expect(entries.first().locator('.cover-dbg-log-kind')).toHaveText('ZASLONA');
        await expect(entries.first().locator('.cover-dbg-log-raw')).toHaveText(COVER_LINE);

        // The log takes the space left over; it must never squeeze the state table.
        const statePane = popup.locator('.cover-dbg-state');
        const heightBefore = (await statePane.boundingBox())!.height;
        for (let i = 0; i < 40; i++) {
            await pushText(page, COVER_LINE, {type: 'other'});
        }
        await expect(popup.locator('.cover-dbg-log-entry')).toHaveCount(41);
        const heightAfter = (await statePane.boundingBox())!.height;
        expect(heightAfter).toBe(heightBefore);
        // Every row still on screen, and the log scrolls instead.
        const stateOverflow = await statePane.evaluate(
            el => el.scrollHeight - el.clientHeight);
        expect(stateOverflow).toBeLessThanOrEqual(1);
        const logScrolls = await popup.locator('.cover-dbg-log').evaluate(
            el => el.scrollHeight > el.clientHeight);
        expect(logScrolls).toBe(true);

        // The establishing line was seen, so the tracker has nothing to report missing.
        await expect(popup.locator('.cover-dbg-counter')).toHaveText('nieznane blokady: 0');
    });
});
