import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getRecentOutput,
    pushGmcp,
    pushText,
    submitCommand,
    waitForCharacter,
    waitForCommandInput,
    waitForOutputContaining,
} from './support/mocks';

test.describe('Introduced (zapamietani/przedstawieni)', () => {
    test('parses zapamietani response and shows count prefix', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'TestChar', object_num: 12345});
        await waitForCharacter(page, 'TestChar');

        // Send the "zapamietani" game command to register the trigger
        await submitCommand(page, 'zapamietani');

        // Push the game response that the trigger is listening for
        await pushText(page, 'Zapamietane przez ciebie imiona to Adas, Bodas i Codas.');

        // The script should add a [3] count prefix to the output
        await waitForOutputContaining(page, '[3]');

        const output = await getRecentOutput(page, 5);
        expect(output, 'should show count prefix [3]').toContain('[3]');
        expect(output, 'should show remembered names').toContain('Adas');
        expect(output, 'should show all names').toContain('Codas');
    });

    test('parses przedstawieni response and shows count prefix', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'TestChar', object_num: 12345});
        await waitForCharacter(page, 'TestChar');

        // Send the "przedstawieni" game command to register the trigger
        await submitCommand(page, 'przedstawieni');

        // Push the game response
        await pushText(page, 'Osoby, ktore zostaly ci ostatnio przedstawione, to Edwin, Grzegorz i Hubert.');

        // The script should add a [3] count prefix
        await waitForOutputContaining(page, '[3]');

        const output = await getRecentOutput(page, 5);
        expect(output, 'should show count prefix [3]').toContain('[3]');
        expect(output, 'should show presented names').toContain('Edwin');
        expect(output, 'should show all presented names').toContain('Hubert');
    });

    test('detects removed names after reload by comparing previous vs current', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'RemovalChar', object_num: 55555});
        await waitForCharacter(page, 'RemovalChar');

        // First pass: send 3 remembered names
        await submitCommand(page, 'zapamietani');
        await pushText(page, 'Zapamietane przez ciebie imiona to Adas, Bodas i Codas.');

        await waitForOutputContaining(page, '[3]');

        // Reload the page to simulate reconnection
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'RemovalChar', object_num: 55555});
        await waitForCharacter(page, 'RemovalChar');

        // Second pass: send only 2 names (Bodas removed)
        await submitCommand(page, 'zapamietani');
        await pushText(page, 'Zapamietane przez ciebie imiona to Adas i Codas.');

        // The script should detect that Bodas was removed and show a message
        await waitForOutputContaining(page, 'Osoby usuniete z zapamietanych');

        const output = await getRecentOutput(page, 10);
        expect(output, 'should show deletion message').toContain('Osoby usuniete z zapamietanych');
        expect(output, 'should show removed name Bodas').toContain('Bodas');
    });

    test('remembered names persist across reload', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'PersistChar', object_num: 66666});
        await waitForCharacter(page, 'PersistChar');

        // Send zapamietani with 3 names
        await submitCommand(page, 'zapamietani');
        await pushText(page, 'Zapamietane przez ciebie imiona to Adas, Bodas i Codas.');

        await waitForOutputContaining(page, '[3]');

        // Reload
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'PersistChar', object_num: 66666});
        await waitForCharacter(page, 'PersistChar');

        // Send the same names again - should NOT show deletion message
        await submitCommand(page, 'zapamietani');
        await pushText(page, 'Zapamietane przez ciebie imiona to Adas, Bodas i Codas.');

        await waitForOutputContaining(page, '[3]');

        const output = await getRecentOutput(page, 10);
        expect(output, 'should show count prefix').toContain('[3]');
        // No deletion message should appear since names are the same
        expect(output, 'should NOT show deletion message').not.toContain('Osoby usuniete');
    });
});
