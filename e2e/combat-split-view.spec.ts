import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    primeCharInfo,
    pushText,
    submitCommand,
    waitForCommandInput,
} from './support/mocks';

const LINES = 60;

async function setup(page: Parameters<typeof waitForCommandInput>[0]) {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page, {name: 'WalkaTester'});

    await submitCommand(page, '/walkaw');
    const combatWindow = page.locator('.combat-popup');
    await expect(combatWindow).toBeVisible();

    for (let i = 1; i <= LINES; i++) {
        await pushText(page, `Lekko ranisz Orka mieczem po raz ${i}.`, {type: 'combat.avatar'});
    }
    await expect(combatWindow.locator('.combat-popup__message')).toHaveCount(LINES);
    // Every appended line suppresses split-view detection for 250ms so the pane
    // cannot blink while the fight streams in.
    await page.waitForTimeout(400);

    return combatWindow;
}

// The messages list is the scrollport; the split pane is its sticky last child.
const scrollTo = (page: Parameters<typeof waitForCommandInput>[0], position: 'top' | 'bottom') =>
    page.locator('.combat-popup__messages').evaluate((el, to) => {
        el.scrollTop = to === 'top' ? 0 : el.scrollHeight;
    }, position);

test.describe('Combat window split view', () => {
    test('no split pane while the window is pinned to the bottom', async ({page}) => {
        const combatWindow = await setup(page);

        await expect(combatWindow.locator('.popup-split-bottom')).toHaveCount(0);
        // Pinned: the newest line is the one on screen.
        const scrolledToBottom = await page.locator('.combat-popup__messages').evaluate(
            el => el.scrollHeight - el.scrollTop - el.clientHeight < 2,
        );
        expect(scrolledToBottom).toBe(true);
    });

    test('scrolling up opens the split pane and mirrors the newest lines', async ({page}) => {
        const combatWindow = await setup(page);

        await scrollTo(page, 'top');

        const pane = combatWindow.locator('.popup-split-bottom');
        await expect(pane).toBeVisible();
        await expect(pane).toContainText(`po raz ${LINES}.`);

        // New combat keeps flowing into the pane while the scrollback stays put.
        const scrollTop = await page.locator('.combat-popup__messages').evaluate(el => el.scrollTop);
        await pushText(page, 'Lekko ranisz Orka mieczem po raz 61.', {type: 'combat.avatar'});
        await expect(pane).toContainText('po raz 61.');
        await expect(page.locator('.combat-popup__messages')).toHaveJSProperty('scrollTop', scrollTop);
    });

    test('scrolling back to the bottom closes the split pane', async ({page}) => {
        const combatWindow = await setup(page);

        await scrollTo(page, 'top');
        await expect(combatWindow.locator('.popup-split-bottom')).toBeVisible();

        // The open transition holds off re-detection for 150ms.
        await page.waitForTimeout(200);
        await scrollTo(page, 'bottom');

        await expect(combatWindow.locator('.popup-split-bottom')).toHaveCount(0);
    });
});
