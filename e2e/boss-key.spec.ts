import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    getLastOutgoingCommand,
    pushGmcp,
    pushText,
    resetCommandLog,
    submitCommand,
    waitForCommandInput,
} from './support/mocks';

const OVERLAY = '.bosskey';
const PAGE_BODY = '.bosskey .bk-page';
const STATUS_PAGE = '.bosskey .bk-status-page';
const ZOOM_VALUE = '.bosskey .bk-zoom-value';
const COMPOSER = '.bosskey .bk-composer';

// Same local helper the other keybind specs use (client-keybinds, bind-capture).
async function pressKey(
    page: Page,
    code: string,
    modifiers: {ctrl?: boolean; alt?: boolean; shift?: boolean} = {},
): Promise<void> {
    if (modifiers.ctrl) await page.keyboard.down('Control');
    if (modifiers.alt) await page.keyboard.down('Alt');
    if (modifiers.shift) await page.keyboard.down('Shift');
    await page.keyboard.down(code);
    await page.keyboard.up(code);
    if (modifiers.shift) await page.keyboard.up('Shift');
    if (modifiers.alt) await page.keyboard.up('Alt');
    if (modifiers.ctrl) await page.keyboard.up('Control');
}

async function boot(page: Page) {
    await page.goto('/');
    await ensureGameSocket(page);
    await waitForCommandInput(page);
}

// The boss key drops a fake Word window over the whole client. Everything here
// is about the two things that make it worth having: nothing leaks through to
// give it away, and the game stays readable underneath the disguise.
test.describe('boss key', () => {
    test('Pause raises the Word window and Escape puts the client back', async ({page}) => {
        await boot(page);

        await expect(page.locator(OVERLAY)).toBeHidden();

        await page.keyboard.press('Pause');
        await expect(page.locator(OVERLAY)).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(page.locator(OVERLAY)).toBeHidden();
    });

    test('the tab claims to be a Word document even while the game is running', async ({page}) => {
        await boot(page);

        // The tab is the one thing an overlay cannot cover and it is on screen
        // constantly, so the disguise is permanent: it must already be in place
        // before the panic key is touched, and must not flip when it is.
        await expect(page.locator(OVERLAY)).toBeHidden();
        await expect(page).toHaveTitle(/\.docx - Word$/);
        const favicon = await page.locator('link[rel~="icon"]').first().getAttribute('href');
        expect(favicon).toContain('image/svg+xml');

        // Game state that would normally rewrite the title must not surface.
        await pushGmcp(page, 'char.state', {hp: 2});
        await expect(page).not.toHaveTitle(/Arkadia/);

        await page.keyboard.press('Pause');
        await expect(page).toHaveTitle(/\.docx - Word$/);
        await page.keyboard.press('Escape');
        await expect(page).toHaveTitle(/\.docx - Word$/);
    });

    test('ScrollLock works as a second panic key, and toggles back off', async ({page}) => {
        await boot(page);

        await page.keyboard.press('ScrollLock');
        await expect(page.locator(OVERLAY)).toBeVisible();

        await page.keyboard.press('ScrollLock');
        await expect(page.locator(OVERLAY)).toBeHidden();
    });

    test('shows the live transcript as the document body', async ({page}) => {
        await boot(page);

        await pushText(page, 'Stoisz posrodku duzej polany.');
        await pushText(page, 'Dokola rosna wysokie drzewa.');
        await pushText(page, 'Widzisz tu male zwierze.');

        await page.keyboard.press('Pause');
        const body = page.locator(PAGE_BODY);
        await expect(body).toBeVisible();

        // One game line per document line. Joining them into paragraphs would
        // read better as prose but destroys combat output, listings and tells.
        const lines = body.locator('p.bk-doc-line');
        await expect(lines.filter({hasText: 'Stoisz posrodku duzej polany.'})).toHaveCount(1);
        await expect(lines.filter({hasText: 'Dokola rosna wysokie drzewa.'})).toHaveCount(1);
        await expect(lines.filter({hasText: 'Widzisz tu male zwierze.'})).toHaveCount(1);
    });

    test('keeps showing output that arrives while it is up', async ({page}) => {
        await boot(page);

        await page.keyboard.press('Pause');
        await expect(page.locator(OVERLAY)).toBeVisible();

        await pushText(page, 'Ktos podchodzi do ciebie z boku.');
        await expect(page.locator(PAGE_BODY).locator('p').filter({hasText: 'Ktos podchodzi do ciebie z boku.'}))
            .toHaveCount(1);
    });

    test('renders the location as a document heading', async ({page}) => {
        await boot(page);

        await pushText(page, 'Waska lesna sciezka', {type: 'room.short'});
        await pushText(page, 'Sciezka wiedzie dalej na polnoc.');

        await page.keyboard.press('Pause');
        await expect(page.locator(`${PAGE_BODY} h2`).filter({hasText: 'Waska lesna sciezka'})).toHaveCount(1);
    });

    test('hides HP in the page number and fatigue in the zoom level', async ({page}) => {
        await boot(page);

        // GMCP hp is 0..6 and displays as hp + 1 out of 7, so hp:4 is "5 z 7".
        await pushGmcp(page, 'char.state', {hp: 4, fatigue: 0});
        await page.keyboard.press('Pause');

        await expect(page.locator(STATUS_PAGE)).toHaveText('Strona 5 z 7');
        await expect(page.locator(ZOOM_VALUE)).toHaveText('100%');

        // Taking damage moves the page number; tiring drops the zoom.
        await pushGmcp(page, 'char.state', {hp: 1, fatigue: 9});
        await expect(page.locator(STATUS_PAGE)).toHaveText('Strona 2 z 7');
        await expect(page.locator(ZOOM_VALUE)).toHaveText('10%');
    });

    test('sends what you type in the document as a command', async ({page}) => {
        await boot(page);

        await page.keyboard.press('Pause');
        await expect(page.locator(COMPOSER)).toBeFocused();

        await page.keyboard.type('polnoc');
        await page.keyboard.press('Enter');

        expect(await getLastOutgoingCommand(page)).toBe('polnoc');
        // Cleared and still focused, ready for the next line.
        await expect(page.locator(COMPOSER)).toHaveValue('');
        await expect(page.locator(COMPOSER)).toBeFocused();

        // The echo goes to the REAL output (so the log stays complete) but is
        // filtered out of the document -- a line reading "-> polnoc" in the
        // middle of a report is the most conspicuous thing that could show up.
        await expect(page.locator(`${PAGE_BODY} p.bk-doc-line`).filter({hasText: 'polnoc'})).toHaveCount(0);
        await expect(page.locator('#main_text_output_msg_wrapper')).toContainText('polnoc');
    });

    test('shares the command history ring with the real command line', async ({page}) => {
        await boot(page);

        await submitCommand(page, 'rozejrzyj sie');

        await page.keyboard.press('Pause');
        await page.keyboard.press('ArrowUp');
        await expect(page.locator(COMPOSER)).toHaveValue('rozejrzyj sie');
    });

    test('nothing typed leaks into the real command line', async ({page}) => {
        await boot(page);

        const input = page.locator('#message-input');
        await input.focus();
        await page.keyboard.press('Pause');

        await page.keyboard.type('polnoc');
        await page.keyboard.press('Enter');

        await page.keyboard.press('Escape');
        await expect(page.locator(OVERLAY)).toBeHidden();
        await expect(input).toHaveValue('');
    });

    test('shows nearby objects in the Navigation pane', async ({page}) => {
        const PLAYER = 91000;
        const ENEMY = 91001;
        const MATE = 91002;

        await boot(page);
        await pushGmcp(page, 'char.info', {name: 'Tester', object_num: PLAYER});
        await pushGmcp(page, 'objects.data', {
            [String(PLAYER)]: {desc: 'Tester', attack_num: false},
            [String(ENEMY)]: {desc: 'wielki goblin', attack_num: false, attack_target: true},
            [String(MATE)]: {desc: 'Druzynowy', attack_num: false, team: true},
        });
        await pushGmcp(page, 'objects.nums', [PLAYER, ENEMY, MATE]);

        await page.keyboard.press('Pause');

        // Word's Navigation pane is a list of short indented entries down the
        // left -- the same shape as an object list, so it carries one.
        const entries = page.locator('.bosskey .bk-nav-entry:not(.bk-nav-attackers)');
        await expect(entries.filter({hasText: 'wielki goblin'})).toHaveCount(1);
        await expect(entries.filter({hasText: 'Druzynowy'})).toHaveCount(1);
        // Your own line is in the outline too, carrying your HP in the same
        // column as everyone else's.
        await expect(entries.filter({hasText: 'Tester'})).toHaveClass(/self/);

        // The attack target reads as the heading you are currently inside.
        await expect(entries.filter({hasText: 'wielki goblin'})).toHaveClass(/current/);
    });

    test('lists attackers under each object by shortcut', async ({page}) => {
        const PLAYER = 92000;
        const ENEMY = 92001;
        const BYSTANDER = 92002;

        await boot(page);
        await pushGmcp(page, 'char.info', {name: 'Tester', object_num: PLAYER});
        await pushGmcp(page, 'objects.data', {
            [String(PLAYER)]: {desc: 'Tester', attack_num: false},
            // attack_num is the id of what this object is fighting -- us.
            [String(ENEMY)]: {desc: 'wsciekly wilk', attack_num: PLAYER},
            [String(BYSTANDER)]: {desc: 'spokojny wedrowiec', attack_num: false},
        });
        await pushGmcp(page, 'objects.nums', [PLAYER, ENEMY, BYSTANDER]);

        await page.keyboard.press('Pause');

        // Every object stays a top-level entry; the ones being attacked gain a
        // sub-line naming their attackers by the object list's shortcut codes.
        const attackers = page.locator('.bosskey .bk-nav-attackers');
        await expect(attackers).toHaveCount(1);
        await expect(attackers).toContainText(':');

        // The bystander fights nobody, so nothing hangs under it.
        const entries = page.locator('.bosskey .bk-nav-entry:not(.bk-nav-attackers)');
        await expect(entries).toHaveCount(3);
    });

    test('still lists everyone during mutual combat', async ({page}) => {
        const PLAYER = 93000;
        const ENEMY = 93001;

        await boot(page);
        await pushGmcp(page, 'char.info', {name: 'Tester', object_num: PLAYER});
        // Combat is mutual: each side's attack_num points at the other. An
        // earlier version restructured the list into a tree, and these cycles
        // dropped both entries out of it -- the pane went empty in every fight.
        await pushGmcp(page, 'objects.data', {
            [String(PLAYER)]: {desc: 'Tester', attack_num: ENEMY},
            [String(ENEMY)]: {desc: 'wielki troll', attack_num: PLAYER, attack_target: true},
        });
        await pushGmcp(page, 'objects.nums', [PLAYER, ENEMY]);

        await page.keyboard.press('Pause');

        const entries = page.locator('.bosskey .bk-nav-entry:not(.bk-nav-attackers)');
        await expect(entries).toHaveCount(2);
        await expect(entries.filter({hasText: 'Tester'})).toHaveCount(1);
        await expect(entries.filter({hasText: 'wielki troll'})).toHaveCount(1);
        // Both are under attack, so both carry an attackers line.
        await expect(page.locator('.bosskey .bk-nav-attackers')).toHaveCount(2);
    });

    test('plots the vitals as a document chart', async ({page}) => {
        await boot(page);
        await pushGmcp(page, 'char.state', {hp: 4, fatigue: 9, stuffed: 3, soaked: 0, encumbrance: 3});

        await page.keyboard.press('Pause');

        // A bar chart is the most document-native widget there is. It carries
        // the four sustain vitals -- the ones worth watching while hidden.
        const bars = page.locator('.bosskey .bk-chart-bar');
        await expect(bars).toHaveCount(4);
        // Series are labelled with terse codes, never the Polish vital names.
        await expect(page.locator('.bosskey .bk-chart-axis')).toHaveText('ZMGLOPRAOBC');

        // Each plots against its own maximum: fatigue 9/9, encumbrance 3/6.
        await expect(bars.nth(0)).toHaveAttribute('style', /height:\s*100%/);
        await expect(bars.nth(3)).toHaveAttribute('style', /height:\s*50%/);
    });

    test('keeps binds working while the overlay is up', async ({page}) => {
        await boot(page);

        await page.keyboard.press('Pause');
        await expect(page.locator(COMPOSER)).toBeFocused();
        await resetCommandLog(page);

        // The composer carries [data-command-input], so the shared keybind guard
        // treats it as a command line rather than an ordinary text field and
        // binds still fire -- exactly as they do on the real one.
        await pressKey(page, 'Digit4', {ctrl: true});

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'Ctrl+4 should still send the lamp command from the overlay',
                timeout: 3000,
            })
            .toBe('napelnij lampe olejem');
    });

    test('leaves the composer unmasked outside password prompts', async ({page}) => {
        await boot(page);

        // EchoHandler.reset() pushes telnet.echo(false) on connect. Reading that
        // as "password" would mask the field from connect onward and never
        // unmask it, so the polarity is pinned here.
        await page.keyboard.press('Pause');
        await expect(page.locator(COMPOSER)).toHaveAttribute('type', 'text');
    });
});
