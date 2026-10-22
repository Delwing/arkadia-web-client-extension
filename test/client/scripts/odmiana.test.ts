import initOdmiana from '@client/scripts/odmiana';
import {
    __resetOdmianaStoreForTests,
    ensureOdmianaLoaded,
    getOdmiana,
    getOdmianaSnapshot,
} from '@modules/data/odmianaStore';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

const PLECAK = [
    'Zamkniety skorzany plecak odmienia sie nastepujaco:',
    '',
    '  Mianownik: zamkniety skorzany plecak,',
    ' Dopelniacz: zamknietego skorzanego plecaka,',
    '   Celownik: zamknietemu skorzanemu plecakowi,',
    '    Biernik: zamkniety skorzany plecak,',
    '  Narzednik: zamknietym skorzanym plecakiem,',
    'Miejscownik: zamknietym skorzanym plecaku.',
];

describe('odmiana', () => {
    let parse: (line: string) => void;

    beforeEach(async () => {
        await __resetOdmianaStoreForTests();
        const client = { Triggers: new Triggers({} as any) };
        initOdmiana(client as any);
        parse = (line) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
        await ensureOdmianaLoaded();
    });

    async function settle(): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    test('stores the six cases, keyed by mianownik', async () => {
        PLECAK.forEach(parse);
        await settle();
        expect(getOdmiana('Zamkniety skorzany plecak')).toEqual({
            mianownik: 'zamkniety skorzany plecak',
            dopelniacz: 'zamknietego skorzanego plecaka',
            celownik: 'zamknietemu skorzanemu plecakowi',
            biernik: 'zamkniety skorzany plecak',
            narzednik: 'zamknietym skorzanym plecakiem',
            miejscownik: 'zamknietym skorzanym plecaku',
        });
    });

    test('ignores case lines with no odmien header before them', async () => {
        PLECAK.slice(2).forEach(parse);
        await settle();
        expect(getOdmianaSnapshot()).toEqual({});
    });

    test('drops a reply whose cases arrive out of order', async () => {
        [PLECAK[0], PLECAK[2], PLECAK[4], PLECAK[3], PLECAK[5], PLECAK[6], PLECAK[7]].forEach(parse);
        await settle();
        expect(getOdmianaSnapshot()).toEqual({});
    });
});
