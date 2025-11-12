import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, waitForCommandInput} from './support/mocks';

test.describe('AWR indicator', () => {
    test('shows AWR indicator when player is team leader', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const attackModeIndicator = page.locator('#attack-mode');

        // Initially, indicator should not be visible (player is not a leader)
        await expect(attackModeIndicator, 'should not show indicator initially').toHaveCSS('display', 'none');

        // Set up player as team leader
        await pushGmcp(page, 'char.info', {object_num: 100});
        await pushGmcp(page, 'objects.data', {
            '100': {desc: 'Player', team: true, team_leader: true},
        });

        // Should show AWR indicator
        await expect(attackModeIndicator, 'should show AWR indicator when player is leader').toBeVisible();
        await expect(attackModeIndicator, 'should show default mode "A"').toContainText('Atk: A');
        await expect(attackModeIndicator, 'should have class "A"').toHaveClass('A');
    });

    test('hides AWR indicator when player is not team leader', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const attackModeIndicator = page.locator('#attack-mode');

        // Set up player as team leader first
        await pushGmcp(page, 'char.info', {object_num: 100});
        await pushGmcp(page, 'objects.data', {
            '100': {desc: 'Player', team: true, team_leader: true},
        });

        await expect(attackModeIndicator, 'should show indicator when leader').toBeVisible();

        // Now make player not a team leader (another player is leader)
        await pushGmcp(page, 'objects.data', {
            '100': {team: true, team_leader: false},
            '101': {desc: 'OtherPlayer', team: true, team_leader: true},
        });

        // Should hide AWR indicator
        await expect(attackModeIndicator, 'should hide indicator when not leader').toHaveCSS('display', 'none');
    });

    test('cycles through attack modes on click', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const attackModeIndicator = page.locator('#attack-mode');

        // Set up player as team leader
        await pushGmcp(page, 'char.info', {object_num: 100});
        await pushGmcp(page, 'objects.data', {
            '100': {desc: 'Player', team: true, team_leader: true},
        });

        await expect(attackModeIndicator, 'should show mode "A" initially').toContainText('Atk: A');
        await expect(attackModeIndicator, 'should have class "A"').toHaveClass('A');

        // Click to cycle to AW
        await attackModeIndicator.click();
        await expect(attackModeIndicator, 'should show mode "AW" after first click').toContainText('Atk: AW');
        await expect(attackModeIndicator, 'should have class "AW"').toHaveClass('AW');

        // Click to cycle to AWR
        await attackModeIndicator.click();
        await expect(attackModeIndicator, 'should show mode "AWR" after second click').toContainText('Atk: AWR');
        await expect(attackModeIndicator, 'should have class "AWR"').toHaveClass('AWR');

        // Click to cycle back to A
        await attackModeIndicator.click();
        await expect(attackModeIndicator, 'should show mode "A" after third click').toContainText('Atk: A');
        await expect(attackModeIndicator, 'should have class "A"').toHaveClass('A');
    });

    test('restores attack mode from localStorage', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Set attack mode to AWR
        await page.evaluate(() => {
            localStorage.setItem('attack_mode', '"AWR"');
        });

        // Reload and set up player as team leader
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {object_num: 100});
        await pushGmcp(page, 'objects.data', {
            '100': {desc: 'Player', team: true, team_leader: true},
        });

        const attackModeIndicator = page.locator('#attack-mode');
        await expect(attackModeIndicator, 'should restore mode "AWR" from localStorage').toContainText('Atk: AWR');
        await expect(attackModeIndicator, 'should have class "AWR"').toHaveClass('AWR');
    });

    test('shows indicator only for team leader, not for team members', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const attackModeIndicator = page.locator('#attack-mode');

        // Set up player as team member (not leader)
        await pushGmcp(page, 'char.info', {object_num: 100});
        await pushGmcp(page, 'objects.data', {
            '100': {desc: 'Player', team: true, team_leader: false},
            '101': {desc: 'Leader', team: true, team_leader: true},
        });

        // Should NOT show AWR indicator
        await expect(attackModeIndicator, 'should not show indicator for non-leader team member').toHaveCSS('display', 'none');
    });

    test('cannot click to cycle modes when not leader', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const attackModeIndicator = page.locator('#attack-mode');

        // Set up player as team leader
        await pushGmcp(page, 'char.info', {object_num: 100});
        await pushGmcp(page, 'objects.data', {
            '100': {desc: 'Player', team: true, team_leader: true},
        });

        await expect(attackModeIndicator, 'should show indicator').toBeVisible();
        await expect(attackModeIndicator, 'should show mode "A"').toContainText('Atk: A');

        // Click to cycle to AW
        await attackModeIndicator.click();
        await expect(attackModeIndicator, 'should show mode "AW"').toContainText('Atk: AW');

        // Now remove leadership
        await pushGmcp(page, 'objects.data', {
            '100': {team: true, team_leader: false},
            '101': {desc: 'NewLeader', team: true, team_leader: true},
        });

        // Indicator should disappear
        await expect(attackModeIndicator, 'should hide when leadership removed').toHaveCSS('display', 'none');
    });

    test('persists attack mode changes to localStorage', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const attackModeIndicator = page.locator('#attack-mode');

        // Set up player as team leader
        await pushGmcp(page, 'char.info', {object_num: 100});
        await pushGmcp(page, 'objects.data', {
            '100': {desc: 'Player', team: true, team_leader: true},
        });

        await expect(attackModeIndicator, 'should show mode "A"').toContainText('Atk: A');

        // Click to cycle to AW
        await attackModeIndicator.click();
        await expect(attackModeIndicator, 'should show mode "AW"').toContainText('Atk: AW');

        // Check localStorage was updated
        const storedMode = await page.evaluate(() => {
            return localStorage.getItem('attack_mode');
        });
        expect(storedMode, 'should persist mode to localStorage').toBe('"AW"');
    });
});
