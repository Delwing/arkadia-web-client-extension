import {expect, test} from './support/fixtures';
import {ensureGameSocket, GMCP_PATHS, pushGmcp, submitCommand, waitForCommandInput} from './support/mocks';

const MENU_BUTTON = '#menu-button';
const UI_SETTINGS_BUTTON = '#ui-settings-button';
const UI_MODAL = '#ui-settings-modal';

async function openUiSettings(page: import('@playwright/test').Page) {
    await page.click(MENU_BUTTON);
    await page.click(UI_SETTINGS_BUTTON);
    const modal = page.locator(UI_MODAL);
    await expect(modal).toBeVisible();
    return modal;
}

async function setTeamNumberingMode(page: import('@playwright/test').Page, mode: 'letters' | 'numbers') {
    const modal = await openUiSettings(page);
    await modal.locator('#ui-team-numbering-mode').selectOption(mode);
    await modal.locator('#ui-settings-save').click();
    await expect(modal).not.toBeVisible();
}

async function setupObjectsScene(page: import('@playwright/test').Page) {
    await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Player', object_num: 100});
    await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
        '100': {desc: 'Player', team: true, team_leader: true, hp: 6},
        '101': {desc: 'Scout', team: true, hp: 5},
        '102': {desc: 'Warrior', team: true, hp: 4},
        '200': {desc: 'Goblin', attack_num: 1, hp: 2},
        '201': {desc: 'Orc', attack_num: 2, hp: 1},
    });
    await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [100, 101, 102, 200, 201]);
}

test.describe('Team numbering mode', () => {
    test('default mode uses letters for team members', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await setupObjectsScene(page);

        const content = page.locator('#objects-list .objects-list-content');
        await expect(content).toBeVisible();

        const shortcuts = page.locator('#objects-list .object-num');
        const texts = await shortcuts.allTextContents();
        // Team members should have letter shortcuts A, B
        expect(texts).toContain('A');
        expect(texts).toContain('B');
        // Enemies should have number shortcuts 1, 2
        expect(texts).toContain('1');
        expect(texts).toContain('2');
    });

    test('numbers mode uses sequential numbers for team and enemies', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await setTeamNumberingMode(page, 'numbers');

        await setupObjectsScene(page);

        const content = page.locator('#objects-list .objects-list-content');
        await expect(content).toBeVisible();

        const shortcuts = page.locator('#objects-list .object-num');
        const texts = await shortcuts.allTextContents();
        // Team first: 1, 2 — then enemies: 3, 4
        expect(texts).toEqual(['1', '2', '3', '4']);
        // No letters should be present
        expect(texts).not.toContain('A');
        expect(texts).not.toContain('B');
    });

    test('numbers mode places neutral objects at 50+ during combat', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await setTeamNumberingMode(page, 'numbers');

        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Player', object_num: 100});
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '100': {desc: 'Player', team: true, team_leader: true, hp: 6},
            '101': {desc: 'Scout', team: true, hp: 5},
            '200': {desc: 'Goblin', attack_num: 1, hp: 2},
            '300': {desc: 'Rock'},
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [100, 101, 200, 300]);

        const content = page.locator('#objects-list .objects-list-content');
        await expect(content).toBeVisible();

        const shortcuts = page.locator('#objects-list .object-num');
        const texts = await shortcuts.allTextContents();
        // Team=1, Enemy=2, Neutral=50
        expect(texts).toEqual(['1', '2', '50']);
    });

    test('persists team numbering mode to storage', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await setTeamNumberingMode(page, 'numbers');

        // teamNumberingMode is a behaviour setting (behaviorSettings key).
        const stored = await page.evaluate(() => {
            try {
                const raw = localStorage.getItem('behaviorSettings');
                return raw ? JSON.parse(raw) : null;
            } catch {
                return null;
            }
        });
        expect(stored?.teamNumberingMode).toBe('numbers');
    });

    test('team aliases work with number shortcuts', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await setTeamNumberingMode(page, 'numbers');
        await setupObjectsScene(page);

        const content = page.locator('#objects-list .objects-list-content');
        await expect(content).toBeVisible();

        // Use /w (withdraw) with number 1 (first team member)
        await submitCommand(page, '/w 1');

        const commands = await page.evaluate(() => {
            const log: string[] = (window as any).__mockCommandLog ?? [];
            return log.slice();
        });
        // Should resolve team member 1 (Scout, obj 101) to ob_101
        const withdrawCmd = commands.find(c => c.includes('ob_101'));
        expect(withdrawCmd).toBeTruthy();
    });

    test('changing mode while team is present renumbers immediately', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Start with default letters mode and set up team
        await setupObjectsScene(page);

        const shortcuts = page.locator('#objects-list .object-num');
        await expect(shortcuts).toHaveCount(4);
        let texts = await shortcuts.allTextContents();
        // Team has letters, enemies have numbers
        expect(texts).toContain('A');
        expect(texts).toContain('B');

        // Switch to numbers mode while team is on screen
        await setTeamNumberingMode(page, 'numbers');

        // Should immediately renumber without needing a GMCP update
        await expect(async () => {
            texts = await shortcuts.allTextContents();
            expect(texts).toEqual(['1', '2', '3', '4']);
        }).toPass({timeout: 3000});
    });

    test('switching back to letters mode restores letter shortcuts', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await setTeamNumberingMode(page, 'numbers');
        await setupObjectsScene(page);

        const shortcuts = page.locator('#objects-list .object-num');
        let texts = await shortcuts.allTextContents();
        expect(texts).toEqual(['1', '2', '3', '4']);

        // Switch back to letters — should re-render immediately
        await setTeamNumberingMode(page, 'letters');

        await expect(async () => {
            texts = await shortcuts.allTextContents();
            expect(texts).toContain('A');
            expect(texts).toContain('B');
        }).toPass({timeout: 3000});
    });
});
