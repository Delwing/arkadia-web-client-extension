import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getLastOutgoingCommand,
    primeCharInfo,
    pushText,
    waitForCommandInput,
} from './support/mocks';

test.describe('Line processing pipeline', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page);
    });

    test('server text appears in the output panel', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        await pushText(page, 'Hello from server');

        await expect(output, 'should display text received from the server').toContainText('Hello from server');
    });

    test('multiple lines appear in order', async ({page}) => {
        const output = page.locator('#main_text_output_msg_wrapper');

        await pushText(page, 'First line of output');
        await pushText(page, 'Second line of output');
        await pushText(page, 'Third line of output');

        await expect(output, 'should display first line').toContainText('First line of output');
        await expect(output, 'should display second line').toContainText('Second line of output');
        await expect(output, 'should display third line').toContainText('Third line of output');

        // Verify ordering: first line appears before second, second before third
        const outputText = await output.textContent() ?? '';
        const firstIdx = outputText.indexOf('First line of output');
        const secondIdx = outputText.indexOf('Second line of output');
        const thirdIdx = outputText.indexOf('Third line of output');
        expect(firstIdx, 'first line should appear before second').toBeLessThan(secondIdx);
        expect(secondIdx, 'second line should appear before third').toBeLessThan(thirdIdx);
    });

    test('trigger fires command when matching text arrives', async ({page}) => {
        // Create a trigger via the UI: pattern "dragon appears" -> command "flee"
        await page.click('#menu-button');
        await page.click('#triggers-button');

        const triggersModal = page.locator('#triggers-modal');
        await expect(triggersModal, 'should open triggers modal').toBeVisible();

        await triggersModal.getByRole('button', {name: 'Dodaj trigger'}).click();
        await triggersModal.getByPlaceholder('Pattern').fill('dragon appears');
        await triggersModal.getByRole('button', {name: 'Dodaj akcję'}).click();
        await triggersModal.locator('select').first().selectOption('command');
        await triggersModal.getByPlaceholder('Command').fill('flee');
        await triggersModal.getByRole('button', {name: 'Dodaj', exact: true}).click();

        await expect(
            triggersModal.locator('code.alias-pattern', {hasText: 'dragon appears'}),
            'should list the new trigger pattern',
        ).toBeVisible();

        await triggersModal.locator('button.btn-close').click();
        await expect(triggersModal, 'should close triggers modal').not.toBeVisible();

        await page.evaluate(() => {
            const globalScope: any = window;
            globalScope.__resetCommandLog?.();
        });

        await pushText(page, 'A dragon appears before you!');

        await expect
            .poll(
                async () => getLastOutgoingCommand(page),
                {message: 'should send the command when trigger matches'},
            )
            .toBe('flee');
    });

    test('non-matching text passes through unchanged with an active trigger', async ({page}) => {
        // Create a trigger that only fires on a specific phrase
        await page.click('#menu-button');
        await page.click('#triggers-button');

        const triggersModal = page.locator('#triggers-modal');
        await expect(triggersModal, 'should open triggers modal').toBeVisible();

        await triggersModal.getByRole('button', {name: 'Dodaj trigger'}).click();
        await triggersModal.getByPlaceholder('Pattern').fill('specific match phrase');
        await triggersModal.getByRole('button', {name: 'Dodaj akcję'}).click();
        await triggersModal.locator('select').first().selectOption('command');
        await triggersModal.getByPlaceholder('Command').fill('some command');
        await triggersModal.getByRole('button', {name: 'Dodaj', exact: true}).click();

        await triggersModal.locator('button.btn-close').click();
        await expect(triggersModal, 'should close triggers modal').not.toBeVisible();

        await page.evaluate(() => {
            const globalScope: any = window;
            globalScope.__resetCommandLog?.();
        });

        const output = page.locator('#main_text_output_msg_wrapper');

        // Push text that does NOT match the pattern
        await pushText(page, 'Something completely different here');

        await expect(
            output,
            'should display non-matching text in output',
        ).toContainText('Something completely different here');

        // Confirm no command was triggered
        const lastCmd = await getLastOutgoingCommand(page);
        expect(lastCmd, 'should not send any command for non-matching text').toBeNull();
    });

    test('color trigger applies highlight color to matching text', async ({page}) => {
        const HIGHLIGHT_COLOR = '#ff0000';
        const MATCH_TEXT = 'highlight this word';

        // Create a trigger: pattern "highlight this word" -> color red
        await page.click('#menu-button');
        await page.click('#triggers-button');

        const triggersModal = page.locator('#triggers-modal');
        await expect(triggersModal, 'should open triggers modal').toBeVisible();

        await triggersModal.getByRole('button', {name: 'Dodaj trigger'}).click();
        await triggersModal.getByPlaceholder('Pattern').fill(MATCH_TEXT);
        await triggersModal.getByRole('button', {name: 'Dodaj akcję'}).click();
        await triggersModal.locator('select').first().selectOption('color');

        // Set the color picker to red
        await triggersModal.locator('input[type="color"]').fill(HIGHLIGHT_COLOR);

        await triggersModal.getByRole('button', {name: 'Dodaj', exact: true}).click();

        await expect(
            triggersModal.locator('code.alias-pattern', {hasText: MATCH_TEXT}),
            'should list the color trigger pattern',
        ).toBeVisible();

        await triggersModal.locator('button.btn-close').click();
        await expect(triggersModal, 'should close triggers modal').not.toBeVisible();

        const output = page.locator('#main_text_output_msg_wrapper');

        await pushText(page, MATCH_TEXT);

        await expect(output, 'should display the highlighted text').toContainText(MATCH_TEXT);

        // The matched text should be wrapped in a colored span
        const coloredSpan = output.locator('span').filter({hasText: MATCH_TEXT}).last();
        await expect(
            coloredSpan,
            'should apply the configured highlight color to the matched text',
        ).toHaveCSS('color', 'rgb(255, 0, 0)');
    });

    test('uppercase trigger transforms matching text to uppercase', async ({page}) => {
        const MATCH_TEXT = 'transform this text';

        // Create a trigger: pattern "transform this text" -> uppercase
        await page.click('#menu-button');
        await page.click('#triggers-button');

        const triggersModal = page.locator('#triggers-modal');
        await expect(triggersModal, 'should open triggers modal').toBeVisible();

        await triggersModal.getByRole('button', {name: 'Dodaj trigger'}).click();
        await triggersModal.getByPlaceholder('Pattern').fill(MATCH_TEXT);
        await triggersModal.getByRole('button', {name: 'Dodaj akcję'}).click();
        // Default action for pattern triggers is already 'uppercase', but select it explicitly
        await triggersModal.locator('select').first().selectOption('uppercase');
        await triggersModal.getByRole('button', {name: 'Dodaj', exact: true}).click();

        await expect(
            triggersModal.locator('code.alias-pattern', {hasText: MATCH_TEXT}),
            'should list the uppercase trigger pattern',
        ).toBeVisible();

        await triggersModal.locator('button.btn-close').click();
        await expect(triggersModal, 'should close triggers modal').not.toBeVisible();

        const output = page.locator('#main_text_output_msg_wrapper');

        await pushText(page, MATCH_TEXT);

        // The matched text should have been converted to uppercase
        await expect(
            output,
            'should display the matched text in uppercase after transformation',
        ).toContainText('TRANSFORM THIS TEXT');
    });
});