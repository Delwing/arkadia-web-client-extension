import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    pushText,
    submitCommand,
    waitForCommandInput,
    waitForOutputContaining,
} from './support/mocks';

const OCEN_KIKIMORA = [
    'Ogladasz dokladnie wielka krwiozercza kikimore.',
    'Stworzenie owo posiada pokryty czarnym, chropowatym i polyskujacym pancerzem tulow.',
    'Walczy z toba.',
    'Wydaje ci sie, ze jestes znacznie silniejsza (-4), duzo lepiej zbudowana (-5) i troche zreczniejsza (-2) niz wielka krwiozercza kikimora.',
    'Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest ona wyjatkowo odporna na bronie niemagiczne i magie zycia.',
];

const OCEN_FORMIT = [
    'Ogladasz dokladnie szkieletowatego zaniedbanego formita.',
    'Istota ta wyglada jak olbrzymia, wyprostowana mrowka.',
    'Wydaje ci sie, ze jestes duzo silniejsza (-5), duzo lepiej zbudowana (-5) i duzo zreczniejsza (-5) niz szkieletowaty zaniedbany formit.',
    'Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on wyjatkowo odporny na kwas i magie zycia oraz wrazliwy na zywiol ognia.',
];

test.describe('Enemy resistances popup', () => {
    test('collects ocen results into the resistance matrix', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        for (const line of [...OCEN_KIKIMORA, ...OCEN_FORMIT]) {
            await pushText(page, line);
        }
        await waitForOutputContaining(page, 'wrazliwy na zywiol ognia');

        await submitCommand(page, '/odpornosci');
        const popup = page.locator('.enemy-res-popup');
        await expect(popup).toBeVisible();

        const rows = popup.locator('tbody tr');
        await expect(rows).toHaveCount(2);

        const formit = rows.filter({hasText: 'formit'});
        await expect(formit.locator('.enemy-res-cell--odporny')).toHaveCount(2);
        await expect(formit.locator('.enemy-res-cell--wrazliwy')).toHaveCount(1);
        await expect(formit.locator('.enemy-res-cell--wrazliwy')).toHaveAttribute('title', 'wrazliwy na zywiol ognia');

        const kikimora = rows.filter({hasText: 'kikimora'});
        await expect(kikimora.locator('.enemy-res-cell--odporny')).toHaveCount(2);

        // The area comes from the live map position, so no row is flagged as area-less.
        await expect(rows.locator('.enemy-res-warn')).toHaveCount(0);
        const nameCell = kikimora.locator('td').first();
        await expect(nameCell).not.toHaveAttribute('title', /nieznany obszar/);
        await expect(nameCell).toHaveAttribute('title', /lokacja \d+/);

        // Sorting by fire puts the fire-vulnerable formit first.
        await popup.locator('th.enemy-res-type', {hasText: 'ogien'}).click();
        await expect(rows.first()).toContainText('formit');

        // List view: one line per enemy with green/red icon badges.
        await popup.getByRole('button', {name: 'Lista'}).click();
        const formitLine = popup.locator('.enemy-res-line', {hasText: 'formit'});
        await expect(formitLine.locator('.enemy-res-chip--wrazliwy')).toHaveText(['ogien']);
        await expect(formitLine.locator('.enemy-res-chip--odporny')).toHaveText(['magia zycia', 'kwas']);
        await expect(formitLine.locator('.enemy-res-chip svg')).toHaveCount(3);
        await popup.getByRole('button', {name: 'Tabela'}).click();

        await popup.getByPlaceholder('Filtruj po nazwie...').fill('form');
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText('formit');

        await rows.first().getByTitle('Usun wpis').click();
        await expect(popup.locator('.popup-empty')).toBeVisible();
    });
});
