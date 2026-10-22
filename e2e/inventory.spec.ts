import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getCommandLog,
    getLastOutgoingCommand,
    primeCharInfo,
    pushText,
    resetCommandLog,
    submitCommand,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';

const REPLY = [
    'Trzymasz dlugi stalowy miecz w prawej rece.',
    'Przy prawej nodze masz przypieta skorzana mysliwska pochwe z wilczym futrem z tkwiacym w niej dlugim krwistym sztyletem.',
    'Przy lewym boku masz przypiety kunsztowny runiczny temblak krasnoludzki.',
    'Nosisz krwistoczerwony poszarpany plaszcz z naciagnietym na glowe kapturem i zamkniete cieniutkie zawiniatko.',
    'Do pasa masz przytroczone krysztalowa olejna lampe i podluzny buklak.',
    'Masz przy sobie tlusciutkie nikczemne licho, dwa zamkniete szarawe skorzane woreczki, ciemna polyskliwa fajke, ' +
        'zamkniety skorzany woreczek z herbem, dwa zamkniete woreczki ze skory kota, zamkniety czarno-zloty zdobiony woreczek, ' +
        'otwarty prosty skorzany plecak, 23 zlote monety, maly cynowy kubek i kosciany widelec.',
].join('\n');

test.describe('Inventory window', () => {
    test('asks the game once, hides the reply and lists what is carried', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'TestHero'});
        await waitForMapReady(page);

        await submitCommand(page, '/ekwipunek');
        const popup = page.locator('.inventory-popup');
        await expect(popup).toBeVisible();
        await expect.poll(() => getLastOutgoingCommand(page)).toBe('i');

        await pushText(page, REPLY);
        await expect(popup.getByText('tlusciutkie nikczemne licho')).toBeVisible();
        await expect(page.locator('#main_text_output_msg_wrapper')).not.toContainText('Masz przy sobie');

        // A sheath holds its dagger; an empty sling says so
        await expect(popup.getByText('dlugi krwisty sztylet', {exact: true})).toBeVisible();
        await expect(popup.locator('.inventory-popup__row', {hasText: 'runiczny temblak'})).toContainText('pusty');

        // Each of a pair of bags is its own row
        await expect(popup.getByText('szarawy skorzany woreczek', {exact: true})).toHaveCount(2);

        if (process.env.INVENTORY_SCREENSHOT) {
            await popup.screenshot({path: process.env.INVENTORY_SCREENSHOT.replace(/\.png$/, '-top.png')});
        }

        await pushText(page, 'Otwarty prosty skorzany plecak zawiera lampe, dwa noze i trzy rubiny.');
        await popup.getByText('prosty skorzany plecak', {exact: true}).click();
        await expect(popup.getByText('trzy rubiny').or(popup.getByText('rubiny'))).toBeVisible();

        if (process.env.INVENTORY_SCREENSHOT) {
            await popup.screenshot({path: process.env.INVENTORY_SCREENSHOT});
        }
    });

    test('moves things by dragging and by the right-click menu', async ({page}) => {
        // Bags as /pojemnik would have set them
        await page.addInitScript(() => {
            localStorage.setItem('TestHero:containers', JSON.stringify({
                money: 'plecak', gems: 'plecak', food: 'plecak', other: 'plecak',
            }));
            // What the herb manager counted in the first woreczek
            localStorage.setItem('TestHero:herb_counts', JSON.stringify({1: {herbs: {siezygron: 4}}}));
        });
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'TestHero'});
        await waitForMapReady(page);

        await submitCommand(page, '/ekwipunek');
        const popup = page.locator('.inventory-popup');
        await pushText(page, REPLY);

        // The bags set in /pojemnik have a column of their own, with what they are for
        const plecak = popup.locator('.inventory-popup__card', {hasText: 'prosty skorzany plecak'});
        await expect(plecak).toContainText('jedzenie');
        await expect(plecak).toContainText('monety');

        // A woreczek shows the herbs the herb manager counted
        await popup.locator('.inventory-popup__row--bag', {hasText: 'szarawy skorzany woreczek'}).first().click();
        await expect(popup.getByText('siezygron', {exact: true})).toBeVisible();

        await resetCommandLog(page);
        const carried = popup.locator('.inventory-popup__carried');
        const kubek = carried.locator('.inventory-popup__row', {hasText: 'maly cynowy kubek'});
        await kubek.scrollIntoViewIfNeeded();
        const from = (await kubek.boundingBox())!;
        const to = (await plecak.boundingBox())!;
        await page.mouse.move(from.x + 20, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(to.x + to.width / 2, to.y + to.height - 10, {steps: 6});

        // Held: gone from the carried list, a gap open in the bag, the item under the cursor
        await expect(kubek).toHaveCount(0);
        await expect(plecak.locator('.inventory-popup__gap')).toBeVisible();
        await expect(popup.locator('.inventory-popup__float')).toContainText('maly cynowy kubek');
        if (process.env.INVENTORY_SCREENSHOT) {
            await popup.screenshot({path: process.env.INVENTORY_SCREENSHOT.replace(/\.png$/, '-dragging.png')});
        }

        await page.mouse.up();
        await expect.poll(() => getCommandLog(page)).toContain('wloz cynowy kubek do swojego plecaka');
        // Dropped: waiting in the bag until the game moves it
        await expect(plecak.locator('.inventory-popup__pending')).toContainText('maly cynowy kubek');

        // The game refuses: it goes straight back, and the window says why
        await pushText(page, 'Maly cynowy kubek nie chce wejsc.');
        await expect(plecak.locator('.inventory-popup__pending')).toHaveCount(0);
        await expect(kubek).toBeVisible();
        await expect(popup.locator('.inventory-popup__notice--refusal')).toContainText('nie chce wejsc');

        // Out of the bag again, onto what is carried
        await pushText(page, 'Otwarty prosty skorzany plecak zawiera lampe i dwa noze.');
        await resetCommandLog(page);
        const noze = plecak.locator('.inventory-popup__row', {hasText: 'noze'});
        await noze.scrollIntoViewIfNeeded();
        const out = (await noze.boundingBox())!;
        const back = (await carried.boundingBox())!;
        await page.mouse.move(out.x + 20, out.y + out.height / 2);
        await page.mouse.down();
        await page.mouse.move(back.x + back.width / 2, back.y + back.height - 20, {steps: 6});
        await page.mouse.up();
        await expect.poll(() => getCommandLog(page)).toContain('wez 2 noze ze swojego plecaka');

        await popup.locator('.inventory-popup__row', {hasText: 'kosciany widelec'}).click({button: 'right'});
        // Bags to put it in, but no woreczki: those hold herbs
        await expect(page.locator('.context-menu__label', {hasText: 'prosty skorzany plecak'})).toBeVisible();
        await expect(page.locator('.context-menu__label', {hasText: 'woreczek'})).toHaveCount(0);
        await page.locator('.context-menu__label', {hasText: 'Odłóż'}).click();
        await expect.poll(() => getCommandLog(page)).toContain('odloz kosciany widelec');

        if (process.env.INVENTORY_SCREENSHOT) {
            await popup.screenshot({path: process.env.INVENTORY_SCREENSHOT.replace(/\.png$/, '-bags.png')});
        }
    });

    test('asks the game how it numbers worn and carried bags, only when told to', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'TestHero'});
        await waitForMapReady(page);

        await submitCommand(page, '/ekwipunek');
        const popup = page.locator('.inventory-popup');
        await pushText(page, [
            'Na plecach nosisz prawie pusty otwarty skorzany plecak.',
            'Masz przy sobie zamkniety zolty podrozny plecak i maly cynowy kubek.',
        ].join('\n'));

        const notice = popup.locator('.inventory-popup__notice', {hasText: 'numeruje'});
        await expect(notice).toContainText('plecak');
        await resetCommandLog(page);
        await notice.getByText('Sprawdź').click();
        await expect.poll(() => getCommandLog(page)).toEqual(['ocen 1. plecak', 'ocen 2. plecak']);

        await pushText(page, [
            'Oceniasz starannie zamkniety zolty podrozny plecak.',
            'Dosc wygodny plecak zaopatrzony w szelki i klape.',
            'Ten element ekwipunku wyglada na calkiem nowy. [5/5]',
            'Oceniasz starannie otwarty skorzany plecak.',
            'Wygodny i pojemny plecak, zrobiony z brazowej, byczej skory.',
            'Ten element ekwipunku wyglada na calkiem nowy. [5/5]',
        ].join('\n'));
        await expect(notice).toHaveCount(0);
        await expect(page.locator('#main_text_output_msg_wrapper')).not.toContainText('Oceniasz starannie');
    });
});
