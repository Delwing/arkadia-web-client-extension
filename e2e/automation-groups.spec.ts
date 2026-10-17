import {expect, test} from './support/fixtures';
import {ensureGameSocket, waitForCommandInput} from './support/mocks';
import {openAutomation, startNew} from './support/automation';

test.describe('Automation group colours', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
    });

    test('an alias colours its groups in the field and flags a group it does not have', async ({page}) => {
        const modal = await openAutomation(page);
        await startNew(page, modal, 'alias');
        await modal.getByPlaceholder('np. zab (.+)').fill('zab (\\w+) (?<bron>\\w+)');

        const field = modal.locator('.automation-hl').first();
        await expect(field.locator('.automation-grp.automation-g1'), 'should tint the first group in the field').toHaveText('(\\w+)');
        await expect(field.locator('.automation-grp.automation-g2'), 'should tint the named group in the field').toHaveText('(?<bron>\\w+)');
        await expect(modal.locator('.automation-breakdown'), 'should not repeat the pattern under the field').toHaveCount(0);

        await modal.getByTitle('Przykładowa komenda').fill('zab goblina mieczem');
        await expect(modal.locator('.automation-test .automation-grp.automation-g1'), 'should tint what $1 took in the test field').toHaveText('goblina');
        await expect(modal.locator('.automation-test__group.automation-g1'), 'should colour what $1 took').toHaveText('$1goblina');
        await expect(modal.locator('.automation-test__group.automation-g2'), 'should give the named group its number and name').toHaveText('$2{bron}mieczem');

        await expect(modal.locator('.trigger-arg-chips__chip.automation-g2'), 'should offer the named group by number and name').toHaveText(['$2', '{bron}']);

        await modal.getByPlaceholder('np. zabij $1').fill('zabij $1 {bron} $3');
        await expect(modal.locator('.automation-unknown'), 'should flag the group the pattern lacks').toContainText('$3');
        await expect(modal.locator('.automation-unknown'), 'should say how many groups there are').toContainText('ma tylko 2 grupy');
        await expect(modal.locator('.automation-out'), 'should fill the named group in the preview').toContainText('zabij goblina mieczem');

        await page.screenshot({path: 'test-results/automation-groups-alias.png'});
    });

    test('a trigger colours nested groups, lined up with the typed text', async ({page}) => {
        const modal = await openAutomation(page);
        await startNew(page, modal, 'trigger');
        await modal.getByTitle('Wzorzec', {exact: true}).fill('^((\\w+) (\\w+)) atakuje cie');

        const field = modal.locator('.automation-hl').first();
        await expect(field.locator('.automation-grp'), 'should draw all three groups').toHaveCount(3);
        await expect(field.locator('.automation-g1 .automation-g2'), 'should nest the inner groups').toHaveText('(\\w+)');

        // The tint sits over the input's own text: the backdrop's text starts where the input's does.
        const offset = await field.evaluate(el => {
            const input = el.querySelector('input')!;
            const text = el.querySelector('.automation-hl__text')!;
            const style = getComputedStyle(input);
            const contentLeft = input.getBoundingClientRect().left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
            return Math.abs(text.getBoundingClientRect().left - contentLeft);
        });
        expect(offset, 'should line the tint up with the typed text').toBeLessThan(1);

        await modal.getByTitle('Linia do testu').fill('Wysoki elf atakuje cie');
        await expect(modal.locator('.automation-test__group'), 'should list every group').toHaveText(['$1Wysoki elf', '$2Wysoki', '$3elf']);
        await expect(modal.locator('.automation-test .automation-g1 .automation-g3'), 'should tint nested captures in the test field').toHaveText('elf');

        await page.screenshot({path: 'test-results/automation-groups-trigger.png'});
    });

    test('a long pattern keeps its tints under the text when the field scrolls', async ({page}) => {
        const modal = await openAutomation(page);
        await startNew(page, modal, 'trigger');
        const input = modal.getByTitle('Wzorzec', {exact: true});
        await input.fill(`${'x'.repeat(120)} (koniec)`);
        await input.press('End');

        const group = modal.locator('.automation-hl').first().locator('.automation-grp');
        await expect(group, 'should scroll the tint into view with the text').toBeInViewport();
        const shift = await modal.locator('.automation-hl').first().evaluate(el => ({
            scroll: el.querySelector('input')!.scrollLeft,
            transform: (el.querySelector('.automation-hl__text') as HTMLElement).style.transform,
        }));
        expect(shift.scroll, 'should have scrolled the field').toBeGreaterThan(0);
        expect(shift.transform, 'should move the tints by the same amount').toBe(`translateX(${-shift.scroll}px)`);
    });

    test('a game line becomes a pattern, and a selected word a group', async ({page}) => {
        const modal = await openAutomation(page);
        await startNew(page, modal, 'trigger');
        await modal.getByTitle('Linia do testu').fill('Wysoki elf atakuje cie.');
        await modal.getByRole('button', {name: 'jako wzorzec'}).click();

        const pattern = modal.getByTitle('Wzorzec', {exact: true});
        await expect(pattern, 'should escape the line and hold it to the whole line').toHaveValue('^Wysoki elf atakuje cie\\.$');
        await expect(modal.locator('.automation-chip.is-ok'), 'should match the line it came from').toBeVisible();

        // Select "Wysoki elf" (after the ^) and turn it into a group.
        await pattern.click();
        await pattern.press('Home');
        await pattern.press('ArrowRight');
        for (let i = 0; i < 'Wysoki elf'.length; i++) await pattern.press('Shift+ArrowRight');
        await modal.getByTitle(/^Wstaw do wzorca/).click();
        const menuEntry = page.locator('.automation-snippet', {hasText: 'Tekst do...'});
        await expect(menuEntry.locator('.automation-g1'), 'should show the capture in the colour of the group it becomes').toBeVisible();
        await menuEntry.click();

        await expect(pattern, 'should put the capture in place of the selection').toHaveValue('^(.+?) atakuje cie\\.$');
        await expect(modal.locator('.automation-test__group'), 'should capture the selected words').toHaveText(['$1Wysoki elf']);
        await expect(pattern, 'should leave the caret after the capture').toBeFocused();
    });

    test('an alias offers captures but no line anchors', async ({page}) => {
        const modal = await openAutomation(page);
        await startNew(page, modal, 'alias');
        const pattern = modal.getByPlaceholder('np. zab (.+)');
        await pattern.fill('kok ');
        await modal.getByTitle(/^Wstaw do wzorca/).click();
        await expect(page.locator('.automation-snippet', {hasText: 'Początek linii'}), 'should leave out anchors for an alias').toHaveCount(0);
        await page.screenshot({path: 'test-results/automation-snippets-menu.png'});
        await page.locator('.automation-snippet', {hasText: 'Liczba'}).click();
        await expect(pattern, 'should insert at the caret').toHaveValue('kok (\\d+)');

        // Zakres: one number or a range, which $i in the command repeats over.
        await pattern.fill('kok ');
        await modal.getByTitle(/^Wstaw do wzorca/).click();
        await page.locator('.automation-snippet', {hasText: 'Zakres'}).click();
        await expect(pattern, 'should insert a range capture').toHaveValue('kok (\\d+(?:-\\d+)?)');
        await modal.getByPlaceholder('np. zabij $1').fill('rozerwij $i. kokon');
        await modal.getByTitle('Przykładowa komenda').fill('kok 1-3');
        await expect(modal.locator('.automation-out'), 'should repeat the command over the range').toContainText('rozerwij 3. kokon');
    });
});
