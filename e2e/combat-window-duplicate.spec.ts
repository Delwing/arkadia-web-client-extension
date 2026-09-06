import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    primeCharInfo,
    pushText,
    submitCommand,
    waitForCommandInput,
    waitForOutputContaining,
} from './support/mocks';

const ORDINARY_HIT = 'Lekko ranisz Orka mieczem.';
const WEAPON_KNOCKED_OFF = 'Ork zwinnym ruchem wytraca ci miecz.';
const CAN_WIELD_AGAIN =
    "Czujesz, ze efekt dzialania czaru 'rozbrojenie postaci' konczy sie i powoli odzyskujesz czucie w swoich dloniach.";

// Opens the combat window, which is what turns the redirect on: while it is
// open, combat lines are captured by the popup instead of the main output.
async function openCombatWindow(page: Parameters<typeof waitForCommandInput>[0]) {
    await submitCommand(page, '/walkaw');
    const combatWindow = page.locator('.combat-popup');
    await expect(combatWindow).toBeVisible();
    return combatWindow;
}

async function setup(page: Parameters<typeof waitForCommandInput>[0]) {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page, {name: 'WalkaTester'});
}

test.describe('Combat window duplicate to main', () => {
    test('ordinary combat lines are captured by the popup only', async ({page}) => {
        await setup(page);
        const combatWindow = await openCombatWindow(page);

        await pushText(page, ORDINARY_HIT, {type: 'combat.avatar'});

        const messages = combatWindow.locator('.combat-popup__message');
        await expect(messages).toHaveCount(1);
        await expect(messages.first()).toContainText('Orka');

        // The main output never sees it.
        const mainOutput = page.locator('#main_text_output_msg_wrapper');
        await expect(mainOutput).not.toContainText('Orka');
    });

    test('weapon knocked off reaches the popup and the main window', async ({page}) => {
        await setup(page);
        const combatWindow = await openCombatWindow(page);

        // An ordinary hit first, so the assertions below cannot pass just
        // because the redirect is off.
        await pushText(page, ORDINARY_HIT, {type: 'combat.avatar'});
        await pushText(page, WEAPON_KNOCKED_OFF, {type: 'combat.avatar'});

        // Still redirected: the popup gets the decorated line.
        const messages = combatWindow.locator('.combat-popup__message');
        await expect(messages).toHaveCount(2);
        await expect(messages.last()).toContainText('BRON');
        await expect(messages.last()).toContainText('wytraca ci miecz');

        // ...and a copy is echoed into the main window.
        await waitForOutputContaining(page, 'wytraca ci miecz');
        const mainOutput = page.locator('#main_text_output_msg_wrapper');
        await expect(mainOutput).toContainText('BRON');
        // The ordinary hit stays hidden.
        await expect(mainOutput).not.toContainText('Orka');
    });

    test('being able to wield again reaches the main window', async ({page}) => {
        await setup(page);
        const combatWindow = await openCombatWindow(page);

        await pushText(page, CAN_WIELD_AGAIN, {type: 'combat.avatar'});

        await expect(combatWindow.locator('.combat-popup__message')).toHaveCount(1);
        await waitForOutputContaining(page, 'Mozesz dobyc broni');
    });

    test('with the redirect off the line is shown once, in the main window', async ({page}) => {
        await setup(page);

        await pushText(page, WEAPON_KNOCKED_OFF, {type: 'combat.avatar'});

        await waitForOutputContaining(page, 'wytraca ci miecz');
        const mainOutput = page.locator('#main_text_output_msg_wrapper');
        await expect(mainOutput).toContainText('BRON');
        // No duplicate: the line was never redirected, so nothing echoed it back.
        const occurrences = await mainOutput.evaluate(
            node => ((node.textContent ?? '').match(/wytraca ci miecz/g) ?? []).length,
        );
        expect(occurrences).toBe(1);
    });

    test('closing the combat window stops the redirect and the duplication', async ({page}) => {
        await setup(page);
        const combatWindow = await openCombatWindow(page);

        await pushText(page, WEAPON_KNOCKED_OFF, {type: 'combat.avatar'});
        await waitForOutputContaining(page, 'wytraca ci miecz');

        await combatWindow.locator('.panel-button--close').click();
        await expect(combatWindow).toBeHidden();

        await pushText(page, ORDINARY_HIT, {type: 'combat.avatar'});

        // With the popup closed everything goes to the main window as usual.
        await waitForOutputContaining(page, 'Orka');
    });
});
