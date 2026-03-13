import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    GMCP_PATHS,
    primeCharInfo,
    pushGmcp,
    pushText,
    submitCommand,
    waitForCommandInput,
    getLastOutgoingCommand,
    waitForMapReady,
    waitForOutputContaining,
} from './support/mocks';

async function getStoredDeposits(page: Page, character: string) {
    return await page.evaluate(([char]) => {
        const key = `${char}:deposits`;
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    }, [character]);
}

async function navigateToBankById(page: Page, bankId: number) {
    await submitCommand(page, `/ustaw ${bankId}`);
}

async function waitForDepositStorage(page: Page, character: string, bankId: number, timeout: number = 2000) {
    await page.waitForFunction(([char, id]) => {
        const key = `${char}:deposits`;
        const raw = localStorage.getItem(key);
        if (!raw) return false;
        try {
            const deposits = JSON.parse(raw);
            return deposits && deposits[id] !== undefined;
        } catch {
            return false;
        }
    }, [character, bankId], { timeout });
}

async function getAllRecentOutput(page: Page, count: number = 3): Promise<string> {
    return await page.evaluate((numMessages) => {
        const wrapper = document.querySelector('#main_text_output_msg_wrapper');
        if (!wrapper) return '';

        const messages = wrapper.querySelectorAll('.output_msg');
        if (messages.length === 0) return '';

        const result: string[] = [];
        const startIdx = Math.max(0, messages.length - numMessages);

        for (let i = startIdx; i < messages.length; i++) {
            const message = messages[i];

            // Try to get text from various possible structures
            const textEl = message.querySelector<HTMLElement>('.output_msg_text');
            if (textEl) {
                const content = textEl.querySelector<HTMLElement>('.output_msg_content');
                if (content) {
                    result.push(content.textContent?.trim() || '');
                } else {
                    result.push(textEl.textContent?.trim() || '');
                }
            } else {
                // Fallback: return all text content, skipping timestamps
                const clone = message.cloneNode(true) as HTMLElement;
                const timestamps = clone.querySelectorAll('.output_timestamp');
                timestamps.forEach(ts => ts.remove());
                result.push(clone.textContent?.trim() || '');
            }
        }

        return result.join('\n');
    }, count);
}

test.describe('Deposits', () => {
    test('parses deposit contents from game messages', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'TestHero'});
        await waitForMapReady(page);

        // Navigate to a bank
        await navigateToBankById(page, 100);

        // Send deposit contents message
        await pushText(page, 'Twoj depozyt zawiera miecz, dwa topory, piec tarcz.');

        // Wait for deposit to be stored
        await waitForDepositStorage(page, 'TestHero', 100);

        // Verify deposit was stored
        const deposits = await getStoredDeposits(page, 'TestHero');
        expect(deposits, 'should store deposit data').toBeTruthy();
        expect(deposits['100'], 'should store deposit for bank room').toBeDefined();
        expect(deposits['100'].name, 'should store bank name').toBe('Bank Poslan');
        expect(deposits['100'].items, 'should parse deposit items').toEqual([
            { count: 1, name: 'miecz' },
            { count: 2, name: 'topory' },
            { count: 5, name: 'tarcz' },
        ]);
    });

    test('handles empty deposit', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'EmptyHero'});
        await waitForMapReady(page);

        await navigateToBankById(page, 101);

        // Send empty deposit message
        await pushText(page, 'Twoj depozyt jest pusty.');

        await waitForDepositStorage(page, 'EmptyHero', 101);

        const deposits = await getStoredDeposits(page, 'EmptyHero');
        expect(deposits['101'], 'should store empty deposit').toBeDefined();
        expect(deposits['101'].items, 'empty deposit should have empty items array').toEqual([]);
    });

    test('handles no deposit case', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'NoDepositHero'});
        await waitForMapReady(page);

        await navigateToBankById(page, 102);

        // Send no deposit message
        await pushText(page, 'Nie posiadasz wykupionego depozytu.');

        await waitForDepositStorage(page, 'NoDepositHero', 102);

        const deposits = await getStoredDeposits(page, 'NoDepositHero');
        expect(deposits['102'], 'should store no deposit state').toBeDefined();
        expect(deposits['102'].items, 'no deposit should have null items').toBeNull();
    });

    test('reads deposits using /depozyty command', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'ReaderHero'});
        await waitForMapReady(page);

        // Store deposits in two different banks
        await navigateToBankById(page, 200);
        await pushText(page, 'Twoj depozyt zawiera miecz, tarcza.');
        await waitForDepositStorage(page, 'ReaderHero', 200);

        await navigateToBankById(page, 201);
        await pushText(page, 'Twoj depozyt zawiera trzy klejnoty.');
        await waitForDepositStorage(page, 'ReaderHero', 201);

        // Use /depozyty command to read all deposits
        await submitCommand(page, '/depozyty');
        await waitForOutputContaining(page, 'Bank A');

        const output = await getAllRecentOutput(page, 5);

        // Verify the output contains both banks and their items
        expect(output, 'should show Bank A name').toContain('Bank A');
        expect(output, 'should show Bank B name').toContain('Bank B');
        expect(output, 'should show miecz from Bank A').toContain('miecz');
        expect(output, 'should show tarcza from Bank A').toContain('tarcza');
        expect(output, 'should show klejnoty from Bank B').toContain('klejnoty');
        expect(output, 'should show count for klejnoty').toContain('3');
    });

    test('updates deposit when contents change', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'UpdateHero'});
        await waitForMapReady(page);

        await navigateToBankById(page, 300);

        // Initial deposit
        await pushText(page, 'Twoj depozyt zawiera miecz.');
        await waitForDepositStorage(page, 'UpdateHero', 300);

        let deposits = await getStoredDeposits(page, 'UpdateHero');
        expect(deposits['300'].items, 'should store initial deposit').toEqual([
            { count: 1, name: 'miecz' },
        ]);

        // Update deposit - add more items
        await pushText(page, 'Twoj depozyt zawiera miecz, dwa topory, piec monet.');
        await waitForOutputContaining(page, 'dwa topory');

        deposits = await getStoredDeposits(page, 'UpdateHero');
        expect(deposits['300'].items, 'should update deposit with new items').toEqual([
            { count: 1, name: 'miecz' },
            { count: 2, name: 'topory' },
            { count: 5, name: 'monet' },
        ]);

        // Update to empty
        await pushText(page, 'Twoj depozyt jest pusty.');
        await waitForOutputContaining(page, 'jest pusty');

        deposits = await getStoredDeposits(page, 'UpdateHero');
        expect(deposits['300'].items, 'should update to empty deposit').toEqual([]);

        // Update to no deposit
        await pushText(page, 'Nie posiadasz wykupionego depozytu.');
        await waitForOutputContaining(page, 'Nie posiadasz');

        deposits = await getStoredDeposits(page, 'UpdateHero');
        expect(deposits['300'].items, 'should update to no deposit').toBeNull();
    });

    test('deposits are isolated per character', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'Alice'});
        await waitForMapReady(page);

        // Alice's deposits
        await navigateToBankById(page, 400);
        await pushText(page, 'Twoj depozyt zawiera miecz, tarcza.');
        await waitForDepositStorage(page, 'Alice', 400);

        const aliceDeposits = await getStoredDeposits(page, 'Alice');
        expect(aliceDeposits['400'], 'Alice should have deposit in Bank 400').toBeDefined();
        expect(aliceDeposits['400'].items).toEqual([
            { count: 1, name: 'miecz' },
            { count: 1, name: 'tarcza' },
        ]);

        // Switch to Bob
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Bob'});
        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'Bob';
        });

        // Bob's deposits
        await navigateToBankById(page, 400);
        await pushText(page, 'Twoj depozyt zawiera dziesiec klejnotow.');
        await waitForDepositStorage(page, 'Bob', 400);

        const bobDeposits = await getStoredDeposits(page, 'Bob');
        expect(bobDeposits['400'], 'Bob should have different deposit in Bank 400').toBeDefined();
        expect(bobDeposits['400'].items).toEqual([
            { count: 10, name: 'klejnotow' },
        ]);

        // Verify Alice's deposits are unchanged
        const aliceDepositsAfter = await getStoredDeposits(page, 'Alice');
        expect(aliceDepositsAfter['400'].items, 'Alice deposits should remain unchanged').toEqual([
            { count: 1, name: 'miecz' },
            { count: 1, name: 'tarcza' },
        ]);

        // Switch back to Alice
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Alice'});
        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'Alice';
        });

        // Check that Alice sees her deposits when using /depozyty
        await submitCommand(page, '/depozyty');
        await waitForOutputContaining(page, 'miecz');

        const aliceOutput = await getAllRecentOutput(page, 3);
        expect(aliceOutput, 'Alice should see her miecz').toContain('miecz');
        expect(aliceOutput, 'Alice should see her tarcza').toContain('tarcza');
        expect(aliceOutput, 'Alice should not see Bob\'s klejnoty').not.toContain('klejnotow');
    });

    test('handles multiple deposits across different banks', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'Traveler'});
        await waitForMapReady(page);

        // Store deposits in 3 different banks
        await navigateToBankById(page, 500);
        await pushText(page, 'Twoj depozyt zawiera miecz.');
        await waitForDepositStorage(page, 'Traveler', 500);

        await navigateToBankById(page, 501);
        await pushText(page, 'Twoj depozyt zawiera piec tarcz.');
        await waitForDepositStorage(page, 'Traveler', 501);

        await navigateToBankById(page, 502);
        await pushText(page, 'Twoj depozyt zawiera dziesiec klejnotow, dwa diamenty.');
        await waitForDepositStorage(page, 'Traveler', 502);

        const deposits = await getStoredDeposits(page, 'Traveler');
        expect(Object.keys(deposits).length, 'should have 3 deposits').toBe(3);
        expect(deposits['500'].name).toBe('Poslan Bank');
        expect(deposits['501'].name).toBe('Eltar Bank');
        expect(deposits['502'].name).toBe('Czarnolas Bank');

        // Read all deposits
        await submitCommand(page, '/depozyty');
        await waitForOutputContaining(page, 'Poslan Bank');

        const output = await getAllRecentOutput(page, 10);
        expect(output, 'should show all three bank names').toMatch(/Poslan Bank.*Eltar Bank.*Czarnolas Bank/s);
    });

    test('parses Polish numbers and special cases', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'PolishNumbers'});
        await waitForMapReady(page);

        await navigateToBankById(page, 600);

        // Test various Polish number formats
        await pushText(page, 'Twoj depozyt zawiera dwadziescia jeden miecz, wiele monet, 100 klejnotow.');
        await waitForDepositStorage(page, 'PolishNumbers', 600);

        const deposits = await getStoredDeposits(page, 'PolishNumbers');
        expect(deposits['600'].items).toEqual([
            { count: 21, name: 'miecz' },
            { count: 'wie', name: 'monet' }, // "wiele" is parsed as "wie"
            { count: 100, name: 'klejnotow' },
        ]);

        // Verify display
        await submitCommand(page, '/depozyty');
        await waitForOutputContaining(page, 'miecz');

        const output = await getAllRecentOutput(page, 5);
        expect(output, 'should show count 21').toContain(' 21');
        expect(output, 'should show wie for wiele').toContain('wie');
        expect(output, 'should show count 100').toContain('100');
    });

    test('/depozyt command sends examine deposit command', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'Examiner'});
        await waitForMapReady(page);

        // Submit /depozyt alias
        await submitCommand(page, '/depozyt');

        // Check that it sent the proper command
        await expect.poll(
            () => getLastOutgoingCommand(page),
            {timeout: 3000}
        ).toBe('przejrzyj depozyt');
    });

    test('shows message when no deposits are saved', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'NoDeposits'});
        await waitForMapReady(page);

        // Try to read deposits when none exist
        await submitCommand(page, '/depozyty');
        await waitForOutputContaining(page, 'Brak');

        const output = await getAllRecentOutput(page, 3);
        expect(output, 'should show no deposits message').toContain('Brak zapisanych depozytow');
    });

    test('/depozyt_reset clears all deposits', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'Resetter'});
        await waitForMapReady(page);

        // Create some deposits
        await navigateToBankById(page, 700);
        await pushText(page, 'Twoj depozyt zawiera miecz.');
        await waitForDepositStorage(page, 'Resetter', 700);

        let deposits = await getStoredDeposits(page, 'Resetter');
        expect(deposits['700'], 'should have deposit before reset').toBeDefined();

        // Reset deposits
        await submitCommand(page, '/depozyt_reset');
        await waitForOutputContaining(page, 'usuniete');

        deposits = await getStoredDeposits(page, 'Resetter');
        expect(deposits, 'deposits should be empty after reset').toEqual({});

        const output = await getAllRecentOutput(page, 3);
        expect(output, 'should show reset confirmation').toContain('Zapisane depozyty zostaly usuniete');
    });
});
