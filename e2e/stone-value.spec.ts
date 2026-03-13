import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, submitCommand, waitForCommandInput, getLastOutgoingCommand} from './support/mocks';

test.describe('Stone value counter', () => {
    test.beforeEach(async ({page}) => {
        await page.clock.install();
    });

    test('executes /ocenkamienie alias and displays total with colored currency', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Submit the /ocenkamienie command
        await submitCommand(page, '/ocenkamienie');

        // Verify that the command "ocen kamienie" was sent
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'should send "ocen kamienie" command',
            })
            .toBe('ocen kamienie');

        // Simulate game responses with stone values
        await pushText(page, 'Wydaje ci sie, ze jest warte okolo 240 miedziaków.');
        await pushText(page, 'Wydaje ci sie, ze sa warte okolo 480 miedziaków.');
        await pushText(page, 'Sa tu 3 sztuki warte 720 miedziaków.');

        // Advance fake clock past the 700ms internal summary timeout
        await page.clock.runFor(800);

        // Check that the total is displayed
        await expect(output, 'should display total stone value message').toContainText('Laczna wartosc kamieni:');

        // Verify the total calculation: 240 + 480 + 720 = 1440 miedziaków = 6 zl
        await expect(output, 'should display correct total (6 zl)').toContainText('6 zl');

        // Verify that the currency values are colored (check for span elements with color)
        const goldValue = output.locator('span').filter({hasText: '6 zl'}).last();
        await expect(goldValue, 'should display gold value with gold color').toHaveCSS(
            'color',
            'rgb(255, 215, 0)' // GOLD_COLOR
        );
    });

    test('handles multiple currency types in total', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        await submitCommand(page, '/ocenkamienie');

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'should send "ocen kamienie" command',
            })
            .toBe('ocen kamienie');

        // Simulate responses totaling 24250 miedziaków = 1 mth + 1 sr + 2 mdz
        // 24000 (1 mth) + 240 (1 zl) + 12 (1 sr) - 2 = 24250
        await pushText(page, 'Wydaje ci sie, ze jest warte okolo 24000 miedziaków.');
        await pushText(page, 'Wydaje ci sie, ze sa warte okolo 240 miedziaków.');
        await pushText(page, 'Wydaje ci sie, ze jest warte okolo 14 miedziaków.');

        // Advance fake clock past the 700ms internal summary timeout
        await page.clock.runFor(800);

        await expect(output, 'should display total with mithril').toContainText('1 mth');
        await expect(output, 'should display total with gold').toContainText('1 zl');
        await expect(output, 'should display total with silver').toContainText('1 sr');
        await expect(output, 'should display total with copper').toContainText('2 mdz');
    });

    test('handles no stones found', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        await submitCommand(page, '/ocenkamienie');

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'should send "ocen kamienie" command',
            })
            .toBe('ocen kamienie');

        // Don't push any stone value responses

        // Advance fake clock past the 700ms internal summary timeout
        await page.clock.runFor(800);

        // The content might change slightly, but there should be no "Laczna wartosc kamieni" message
        await expect(output, 'should not display total when no stones found').not.toContainText('Laczna wartosc kamieni');
    });

    test('displays individual stone values with currency breakdown', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        await submitCommand(page, '/ocenkamienie');

        // Push a stone value and check that it gets enhanced with currency breakdown
        await pushText(page, 'Wydaje ci sie, ze jest warte okolo 240 miedziaków.');

        // The processItemValue function should append ", czyli 1 zl" to the line
        await expect(output, 'should display individual stone value with breakdown').toContainText('240 miedziaków, czyli 1 zl');
    });

    test('correctly sums values across different stone descriptions', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        await submitCommand(page, '/ocenkamienie');

        // Test different patterns: "jest warte", "sa warte", and "Sa tu X sztuki warte"
        await pushText(page, 'Wydaje ci sie, ze jest warte okolo 100 miedziaków.');
        await pushText(page, 'Wydaje ci sie, ze sa warte okolo 200 miedziaków.');
        await pushText(page, 'Sa tu 5 sztuki warte 300 miedziaków.');

        // Advance fake clock past the 700ms internal summary timeout
        await page.clock.runFor(800);

        // Total: 100 + 200 + 300 = 600 = 2 zl + 2 sr
        await expect(output, 'should display correct sum from different patterns').toContainText('Laczna wartosc kamieni:');
        await expect(output, 'should calculate total correctly').toContainText('2 zl');
    });

    test('handles numeric count in "Wydaje ci sie, ze jest tu X sztuk wartych" pattern', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        await submitCommand(page, '/ocenkamienie');

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'should send "ocen kamienie" command',
            })
            .toBe('ocen kamienie');

        // Test the pattern with numeric count: "Wydaje ci sie, ze jest tu 340 sztuk wartych 910000 miedziakow."
        await pushText(page, 'Wydaje ci sie, ze jest tu 340 sztuk wartych 910000 miedziakow.');

        // Advance fake clock past the 700ms internal summary timeout
        await page.clock.runFor(800);

        // 910000 miedziaków = 37 mth + 11 zl + 1 sr + 8 mdz
        await expect(output, 'should display total from numeric count pattern').toContainText('Laczna wartosc kamieni:');
        await expect(output, 'should display mithril value').toContainText('37 mth');
    });
});
