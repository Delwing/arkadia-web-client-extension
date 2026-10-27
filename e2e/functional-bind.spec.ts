import {openSettings, SETTINGS_SAVE} from './support/settings';
import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput, getLastOutgoingCommand} from './support/mocks';

test.describe('Functional Bind', () => {
    test('should display bind message when triggered by seat prompt', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger the seat bind with a game message
        await pushText(page, 'Gdzie chcesz usiasc? Przy stole, przy oknie czy przy barze?');

        // Check that the bind message is visible in output
        await expect(output, 'should contain bind message').toContainText('bind');
        await expect(output, 'should contain usiadz command').toContainText('usiadz przy');
        await expect(output, 'should contain the default bind key label').toContainText(']');
    });

    test('should create clickable link in bind message', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger a seat bind
        await pushText(page, 'Zosia mowi do ciebie: A moze najpierw gdzies usiadziesz?');

        // Verify bind message appears
        await expect(output).toContainText('bind');
        await expect(output).toContainText('usiadz');

        // Check that the bind message contains a clickable link
        const hasClickableLink = await page.evaluate(() => {
            const output = document.querySelector('#main_text_output_msg_wrapper');
            if (!output) return false;

            // Look for clickable elements (with onclick or link)
            const clickableElements = output.querySelectorAll('[onclick], a[href], span[style*="cursor"]');
            return clickableElements.length > 0;
        });

        expect(hasClickableLink, 'bind message should contain clickable element').toBe(true);
    });

    test('should execute command when bind key is pressed', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger a seat bind
        await pushText(page, 'A moze najpierw gdzies usiadziesz?');

        // Verify bind message appears
        await expect(output).toContainText('bind');
        await expect(output).toContainText('usiadz');

        // Press the default bind key (BracketRight = ']')
        await page.keyboard.press('BracketRight');

        // Verify the command was sent
        const lastCommand = await getLastOutgoingCommand(page);
        expect(lastCommand, 'should send command when key pressed').toBe('usiadz');
    });

    test('should display bind with proper colors', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger a seat bind
        await pushText(page, 'A moze najpierw gdzies usiadziesz?');

        // Verify bind message appears
        await expect(output).toContainText('bind');
        await expect(output).toContainText('usiadz');

        // Check that the output contains colored text (has color styling)
        const hasColoredElements = await page.evaluate(() => {
            const output = document.querySelector('#main_text_output_msg_wrapper');
            if (!output) return false;

            // Look for elements with color styling in the output
            const coloredElements = output.querySelectorAll('[style*="color"]');
            return coloredElements.length > 0;
        });

        expect(hasColoredElements, 'bind message should have colored elements').toBe(true);
    });

    test('should display bind with hex colors', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger a seat bind
        await pushText(page, 'Gdzie chcesz usiasc? Przy stole czy przy oknie?');

        // Verify bind message appears
        await expect(output).toContainText('bind');
        await expect(output).toContainText('usiadz przy');

        // Check that the bind message uses proper hex colors (#00ffaf and #ffd787)
        const usesProperColors = await page.evaluate(() => {
            const output = document.querySelector('#main_text_output_msg_wrapper');
            if (!output) return false;

            // Look for elements with the specific hex colors we set
            const html = output.innerHTML;
            // Check for color #00ffaf (bind text color) or #ffd787 (label color)
            return html.includes('#00ffaf') || html.includes('#ffd787') ||
                   html.includes('rgb(0, 255, 175)') || html.includes('rgb(255, 215, 135)');
        });

        expect(usesProperColors, 'bind message should use hex colors from xterm palette').toBe(true);
    });
});


test('custom functional bind style persists and its footer executes the active action with output hidden', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    const modal = await openSettings(page, 'ui-commands');
    await modal.getByRole('button', {name: 'Subtelny + stopka'}).click();
    await expect(modal.locator('#ui-functional-bind-output')).toHaveValue('compact');
    await modal.locator('#ui-functional-bind-template').fill('Akcja [{key}]: {action}');
    await modal.locator(SETTINGS_SAVE).click();
    await expect(modal).not.toBeVisible();

    await pushText(page, 'A moze najpierw gdzies usiadziesz?');
    const output = page.locator('#main_text_output_msg_wrapper');
    await expect(output).toContainText('Akcja []]: usiadz');
    const footer = page.locator('#multi-binds .multi-bind--functional');
    await expect(footer).toContainText('usiadz');
    await expect(footer.locator('.multi-bind-action')).toHaveCSS('color', 'rgb(160, 160, 160)');
    await footer.click();
    await expect.poll(() => getLastOutgoingCommand(page)).toBe('usiadz');

    await page.reload();
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    const reopened = await openSettings(page, 'ui-commands');
    await expect(reopened.locator('#ui-functional-bind-output')).toHaveValue('compact');
    await expect(reopened.locator('#ui-functional-bind-template')).toHaveValue('Akcja [{key}]: {action}');
    await expect(reopened.locator('#ui-functional-bind-footer')).toBeChecked();
    await reopened.locator('#ui-functional-bind-output').selectOption('hidden');
    await reopened.locator(SETTINGS_SAVE).click();
    await expect(reopened).not.toBeVisible();
    await pushText(page, 'A moze najpierw gdzies usiadziesz?');
    await expect(footer).toContainText('usiadz');
    await expect(output).not.toContainText('Akcja []]: usiadz');
    await footer.click();
    await expect.poll(() => getLastOutgoingCommand(page)).toBe('usiadz');
});
