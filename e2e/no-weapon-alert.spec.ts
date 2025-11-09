import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput} from './support/mocks';

test.describe('No weapon alert', () => {
    test('alerts when attacking with fist', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Simulate hitting with left fist
        await pushText(page, 'Probujesz trafic Orka lewym piescia.');

        // Should show alert message
        await expect(output, 'should display no weapon alert message').toContainText('Walczysz bez broni');

        // Check that the message is styled in red
        const alertMessage = output.locator('span').filter({hasText: 'Walczysz bez broni'}).last();
        await expect(alertMessage, 'should display alert message with red color').toHaveCSS(
            'color',
            'rgb(255, 0, 0)'
        );
    });

    test('alerts when attacking with knee', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Simulate hitting with right knee
        await pushText(page, 'Ledwo muskasz Goblin prawym kolanem.');

        await expect(output, 'should display no weapon alert').toContainText('Walczysz bez broni');
    });

    test('alerts when attacking with foot', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Simulate hitting with left foot
        await pushText(page, 'Lekko ranisz Troll lewym stopa.');

        await expect(output, 'should display no weapon alert').toContainText('Walczysz bez broni');
    });

    test('alerts when attacking with elbow', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Simulate hitting with right elbow
        await pushText(page, 'Nie udaje ci sie trafic Szczura prawym lokciem.');

        await expect(output, 'should display no weapon alert').toContainText('Walczysz bez broni');
    });

    test('alerts when boot attack is parried', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Simulate boot attack parried
        await pushText(page, 'Wykonujesz zamach lewym butem mierzac w Wojownika, lecz ten paruje go tarcza.');

        await expect(output, 'should display no weapon alert').toContainText('Walczysz bez broni');
    });

    test('throttles alerts to once per 5 seconds', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // First attack
        await pushText(page, 'Probujesz trafic Orka lewym piescia.');
        await expect(output, 'should display first alert').toContainText('Walczysz bez broni');

        // Get text content after first alert
        const firstAlertContent = await output.textContent();

        // Second attack immediately after
        await pushText(page, 'Probujesz trafic Orka prawym piescia.');
        await page.waitForTimeout(100);

        // Get text content after second attack
        const secondAlertContent = await output.textContent();

        // Count occurrences of the alert message
        const firstCount = (firstAlertContent || '').split('Walczysz bez broni').length - 1;
        const secondCount = (secondAlertContent || '').split('Walczysz bez broni').length - 1;

        // Should still be the same count (throttled)
        expect(secondCount, 'should not show second alert due to throttling').toBe(firstCount);

        // Wait for throttle period to expire (5 seconds + buffer)
        await page.waitForTimeout(5100);

        // Third attack after throttle expires
        await pushText(page, 'Probujesz trafic Orka lewym kolanem.');
        await page.waitForTimeout(100);

        // Get text content after third attack
        const thirdAlertContent = await output.textContent();
        const thirdCount = (thirdAlertContent || '').split('Walczysz bez broni').length - 1;

        // Should now have one more alert
        expect(thirdCount, 'should show new alert after throttle expires').toBe(firstCount + 1);
    });

    test('alerts for different attack types', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        const attackTypes = [
            'Nie udaje ci sie trafic Orka lewym piescia.',
            'Probujesz trafic Goblin prawym kolanem.',
            'Ledwo muskasz Troll lewym stopa.',
            'Lekko ranisz Szczura prawym lokciem.',
        ];

        for (let i = 0; i < attackTypes.length; i++) {
            // Wait for throttle to expire between attacks
            if (i > 0) {
                await page.waitForTimeout(5100);
            }

            await pushText(page, attackTypes[i]);
            await page.waitForTimeout(100);

            await expect(output, `should display alert for attack type: ${attackTypes[i]}`).toContainText('Walczysz bez broni');
        }
    });

    test('does not alert for weapon attacks', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Get initial content
        await page.waitForTimeout(100);
        const initialContent = await output.textContent();

        // Simulate normal weapon attack (should not trigger alert)
        await pushText(page, 'Probujesz trafic Orka mieczem.');
        await page.waitForTimeout(100);

        // Content should not contain the alert
        await expect(output, 'should not show alert for weapon attack').not.toContainText('Walczysz bez broni');

        const finalContent = await output.textContent();
        const initialCount = (initialContent || '').split('Walczysz bez broni').length - 1;
        const finalCount = (finalContent || '').split('Walczysz bez broni').length - 1;

        // Count should be the same
        expect(finalCount).toBe(initialCount);
    });

    test('alert message format and styling', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger alert
        await pushText(page, 'Probujesz trafic Orka lewym piescia.');

        // Check for the complete message format with prefix
        await expect(output).toContainText('>> Walczysz bez broni!');

        // Verify the red color styling
        const alertMessage = output.locator('span').filter({hasText: 'Walczysz bez broni'}).last();
        await expect(alertMessage).toHaveCSS('color', 'rgb(255, 0, 0)');
    });
});
