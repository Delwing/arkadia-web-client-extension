import { expect, test } from './support/fixtures';
import { ensureGameSocket, GMCP_PATHS, pushGmcp, submitCommand, waitForCommandInput } from './support/mocks';

// The /demo_kondycje popup fakes a fight so the object list can be eyeballed.
// These cover the two states that do NOT come from GMCP: the gold "next target"
// mark (real attack queue) and "ogluch" (real enemy-status filter override).
test.describe('Object list demo popup', () => {
    async function openDemo(page: any) {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, { name: 'Hero', object_num: 99 });
        await submitCommand(page, '/demo_kondycje');
        await expect(page.locator('.object-list-demo-popup')).toBeVisible();
    }

    test('marks the queued enemy gold and moves the mark when switched', async ({ page }) => {
        await openDemo(page);

        // "Goblin lucznik" (202) is the default next target.
        const lucznik = page.locator('#objects-list .object-num[data-object-id="202"]');
        await expect(lucznik).toHaveClass(/object-num-next-target/);

        const wojownik = page.locator('#objects-list .object-num[data-object-id="201"]');
        await expect(wojownik).not.toHaveClass(/object-num-next-target/);

        // Hand the mark to "Goblin wojownik" — only one enemy can head the queue.
        await page.locator('.demo-object-card--enemy').first()
            .locator('.demo-checkbox--next input').check();

        await expect(wojownik).toHaveClass(/object-num-next-target/);
        await expect(lucznik).not.toHaveClass(/object-num-next-target/);
    });

    test('ogluch inverts the description through the enemy-status filter', async ({ page }) => {
        await openDemo(page);

        // "Goblin szaman" (203) starts ogluszony. The stock list flavor paints the
        // filter's colours literally.
        const szaman = page.locator('#objects-list .object-desc[data-object-id="203"] span');
        await expect(szaman).toHaveCSS('color', 'rgb(0, 0, 0)');
        await expect(szaman).toHaveCSS('background-color', 'rgb(255, 255, 255)');

        // Untick it and the override goes away.
        await page.locator('.demo-object-card--enemy').last()
            .locator('.demo-checkbox--ogluch input').uncheck();

        await expect(page.locator('#objects-list .object-desc[data-object-id="203"] span'))
            .toHaveCount(0);
    });

    test('closing the demo clears the faked attack queue', async ({ page }) => {
        await openDemo(page);
        await expect(page.locator('#objects-list .object-num-next-target')).toBeVisible();

        await page.locator('.object-list-demo-popup .fw-close, .object-list-demo-popup [title="Zamknij"]').first().click();

        // Real objects arrive; nothing should still be marked from the demo.
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '99': { desc: 'Hero', team: true, team_leader: true },
            '202': { desc: 'Goblin lucznik', attack_num: false },
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [99, 202]);

        await expect(page.locator('#objects-list .object-num[data-object-id="202"]')).toBeVisible();
        await expect(page.locator('#objects-list .object-num-next-target')).toHaveCount(0);
    });
});
