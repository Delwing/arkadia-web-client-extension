import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, waitForCommandInput} from './support/mocks';

test.describe('Leader attack warning', () => {
    test('shows warning when leader attacks and avatar does not match', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Set up team scenario:
        // - Player is object 5
        // - Leader is object 10
        // - Attack target is object 20
        // - Leader attacks object 20, but player does not
        await pushGmcp(page, 'char.info', {object_num: 5});
        await pushGmcp(page, 'objects.data', {
            '10': {team: true, team_leader: true, desc: 'Leader', attack_num: 20},
            '5': {team: true, desc: 'Player', attack_num: false},
        });
        await pushGmcp(page, 'objects.data', {
            '20': {living: true, attack_target: true, desc: 'Target'},
        });

        // Should show warning to attack
        await expect(output, 'should display leader attack warning').toContainText('Zaatakuj cel ataku');

        // Check that the message is styled in red
        const alertMessage = output.locator('span').filter({hasText: 'Zaatakuj cel ataku'}).last();
        await expect(alertMessage, 'should display warning with red color').toHaveCSS(
            'color',
            'rgb(255, 0, 0)'
        );
    });

    test('shows support warning when leader attacks different target', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Set up scenario:
        // - Player is object 5
        // - Leader is object 10
        // - Attack target is object 20
        // - Leader attacks object 15 (different from attack target)
        await pushGmcp(page, 'char.info', {object_num: 5});
        await pushGmcp(page, 'objects.data', {
            '10': {team: true, team_leader: true, desc: 'Leader', attack_num: 15},
            '5': {team: true, desc: 'Player', attack_num: false},
        });
        await pushGmcp(page, 'objects.data', {
            '20': {living: true, attack_target: true, desc: 'Target'},
            '15': {living: true, desc: 'Other Target'},
        });

        // Should show warning to support
        await expect(output, 'should display support warning').toContainText('wesprzyj');
    });

    test('does not show warning when avatar matches leader attack', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Get initial content
        await page.waitForTimeout(100);
        await output.textContent();

        // Set up a scenario where player and leader attack the same target
        await pushGmcp(page, 'char.info', {object_num: 5});
        await pushGmcp(page, 'objects.data', {
            '10': {team: true, team_leader: true, desc: 'Leader', attack_num: 20},
            '5': {team: true, desc: 'Player', attack_num: 20},
        });
        await pushGmcp(page, 'objects.data', {
            '20': {living: true, attack_target: true, desc: 'Target'},
        });

        await page.waitForTimeout(100);

        // Should NOT show warning
        await expect(output, 'should not show warning when attacks match').not.toContainText('Zaatakuj cel ataku');
        await expect(output, 'should not show support warning when attacks match').not.toContainText('wesprzyj');
    });

    test('throttles warnings to once per 5 seconds', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Set up team scenario
        await pushGmcp(page, 'char.info', {object_num: 5});
        await pushGmcp(page, 'objects.data', {
            '10': {team: true, team_leader: true, desc: 'Leader', attack_num: 20},
            '5': {team: true, desc: 'Player', attack_num: false},
            '20': {living: true, attack_target: true, desc: 'Target'},
        });

        await expect(output, 'should display first warning').toContainText('Zaatakuj cel ataku');

        // Get text content after first warning
        const firstWarningContent = await output.textContent();

        // Trigger another gmcp.objects.data event immediately after
        await pushGmcp(page, 'objects.data', {
            '10': {attack_num: 20},
        });
        await page.clock.runFor(100);

        // Get text content after second event
        const secondWarningContent = await output.textContent();

        // Count occurrences of the warning message
        const firstCount = (firstWarningContent || '').split('Zaatakuj cel ataku').length - 1;
        const secondCount = (secondWarningContent || '').split('Zaatakuj cel ataku').length - 1;

        // Should still be the same count (throttled)
        expect(secondCount, 'should not show second warning due to throttling').toBe(firstCount);

        // Wait for throttle period to expire (5 seconds + buffer)
        await page.clock.runFor(5100);

        // Trigger another event after throttle expires
        await pushGmcp(page, 'objects.data', {
            '10': {attack_num: 20},
        });
        await page.clock.runFor(100);

        // Get text content after third event
        const thirdWarningContent = await output.textContent();
        const thirdCount = (thirdWarningContent || '').split('Zaatakuj cel ataku').length - 1;

        // Should now have one more warning
        expect(thirdCount, 'should show new warning after throttle expires').toBe(firstCount + 1);
    });

    test('does not show warning when attack target disappears', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Set up team scenario
        await pushGmcp(page, 'char.info', {object_num: 5});
        await pushGmcp(page, 'objects.data', {
            '10': {team: true, team_leader: true, desc: 'Leader', attack_num: 20},
            '5': {team: true, desc: 'Player', attack_num: false},
            '20': {living: true, attack_target: true, desc: 'Target'},
        });

        await expect(output, 'should display initial warning').toContainText('Zaatakuj cel ataku');

        // Get initial warning count
        const initialContent = await output.textContent();
        const initialCount = (initialContent || '').split('Zaatakuj cel ataku').length - 1;

        // Wait for throttle to expire
        await page.clock.runFor(5100);

        // Remove attack target
        await pushGmcp(page, 'objects.data', {
            '20': {attack_target: false},
        });
        await page.clock.runFor(100);

        // Trigger another event - should not show warning
        await pushGmcp(page, 'objects.data', {
            '10': {attack_num: 20},
        });
        await page.clock.runFor(100);

        const finalContent = await output.textContent();
        const finalCount = (finalContent || '').split('Zaatakuj cel ataku').length - 1;

        // Count should be the same (no new warning)
        expect(finalCount, 'should not show warning after attack target disappears').toBe(initialCount);
    });

    test('respects throttle on repeated mismatch events', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Set up team scenario
        await pushGmcp(page, 'char.info', {object_num: 5});
        await pushGmcp(page, 'objects.data', {
            '10': {team: true, team_leader: true, desc: 'Leader', attack_num: 20},
            '5': {team: true, desc: 'Player', attack_num: false},
            '20': {living: true, attack_target: true, desc: 'Target'},
        });

        await expect(output, 'should display first warning').toContainText('Zaatakuj cel ataku');

        const firstContent = await output.textContent();
        const firstCount = (firstContent || '').split('Zaatakuj cel ataku').length - 1;

        // Send multiple mismatch events in quick succession
        for (let i = 0; i < 3; i++) {
            await pushGmcp(page, 'objects.data', {
                '10': {attack_num: 20},
            });
            await page.waitForTimeout(100);
        }

        const afterRapidContent = await output.textContent();
        const afterRapidCount = (afterRapidContent || '').split('Zaatakuj cel ataku').length - 1;

        // Should not have increased (all throttled)
        expect(afterRapidCount, 'should not show additional warnings during throttle').toBe(firstCount);
    });

    test('shows correct keybind in warning message', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Trigger attack warning (uses default keybind CTRL+1 for attack)
        await pushGmcp(page, 'char.info', {object_num: 5});
        await pushGmcp(page, 'objects.data', {
            '10': {team: true, team_leader: true, desc: 'Leader', attack_num: 20},
            '5': {team: true, desc: 'Player', attack_num: false},
            '20': {living: true, attack_target: true, desc: 'Target'},
        });

        // Should show default attack keybind (CTRL+1)
        await expect(output, 'should display default attack keybind').toContainText('CTRL+1');

        // Wait for throttle
        await page.clock.runFor(5100);

        // Trigger support warning (uses default keybind CTRL+Q for support)
        await pushGmcp(page, 'objects.data', {
            '10': {attack_num: 15},
            '15': {living: true, desc: 'Other Target'},
        });

        // Should show default support keybind (CTRL+Q)
        await expect(output, 'should display default support keybind').toContainText('CTRL+Q');
    });
});
