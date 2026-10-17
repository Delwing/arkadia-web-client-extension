import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import { setTestSettings } from '../helpers/testSettings';
import {
    herbFormForCount,
    inspectHerbBag,
    parseHerbBagContent,
    resolveHerbName,
} from '@client/scripts/herbBags';

const herbData = {
    version: 1,
    herb_id_to_use: {},
    herb_id_to_odmiana: {
        deliona: {
            mianownik: 'zolty jasny kwiat', dopelniacz: 'zoltego jasnego kwiata', biernik: 'zolty jasny kwiat',
            mnoga_mianownik: 'zolte jasne kwiaty', mnoga_dopelniacz: 'zoltych jasnych kwiatow', mnoga_biernik: 'zolte jasne kwiaty',
            narzednik: 'zoltym jasnym kwiatem',
        },
        arnika: {
            mianownik: 'zlocistopomaranczowy duzy kwiat', dopelniacz: 'zlocistopomaranczowego duzego kwiatu', biernik: 'zlocistopomaranczowy duzy kwiat',
            mnoga_mianownik: 'zlocistopomaranczowe duze kwiaty', mnoga_dopelniacz: 'zlocistopomaranczowych duzych kwiatow', mnoga_biernik: 'zlocistopomaranczowe duze kwiaty',
            narzednik: 'zlocistopomaranczowym duzym kwiatem',
        },
    },
};

vi.mock('@client/scripts/herbsLoader', () => ({
    default: () => Promise.resolve(herbData),
    subscribeToHerbs: () => () => {},
}));

describe('herb names', () => {
    test('the form after a count follows Polish numerals', () => {
        expect(herbFormForCount('deliona', 1, herbData)).toBe('zolty jasny kwiat');
        expect(herbFormForCount('deliona', 3, herbData)).toBe('zolte jasne kwiaty');
        expect(herbFormForCount('deliona', 5, herbData)).toBe('zoltych jasnych kwiatow');
        expect(herbFormForCount('deliona', 12, herbData)).toBe('zoltych jasnych kwiatow');
        expect(herbFormForCount('deliona', 23, herbData)).toBe('zolte jasne kwiaty');
        expect(herbFormForCount('nieznane', 2, herbData)).toBe('nieznane');
    });

    test('resolves a description in any case and with a count', () => {
        expect(resolveHerbName('zolty jasny kwiat', herbData)).toBe('deliona');
        expect(resolveHerbName('Zoltych jasnych kwiatow', herbData)).toBe('deliona');
        expect(resolveHerbName('dwa zlocistopomaranczowe duze kwiaty', herbData)).toBe('arnika');
        expect(resolveHerbName('zlocistopomaranczowy duzy kwiat.', herbData)).toBe('arnika');
        expect(resolveHerbName('gruby szarawy grzyb', herbData)).toBeNull();
    });

    test('parses a bag listing into herb counts, keeping unknown names', () => {
        expect(parseHerbBagContent('trzy zolte jasne kwiaty, wiele zlocistopomaranczowych duzych kwiatow i gruby szarawy grzyb', herbData, 25))
            .toEqual({ deliona: 3, arnika: 25, 'gruby szarawy grzyb': 1 });
    });
});

describe('inspectHerbBag', () => {
    const setup = () => {
        const triggers = new Triggers({} as never);
        const client = { Triggers: triggers, sendCommand: jest.fn() };
        const push = (text: string) => triggers.parseLine(new AnsiAwareBuffer(text), 'text');
        return { client, push };
    };
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        setTestSettings({ herbWieleCount: 30 });
    });

    afterEach(() => jest.useRealTimers());

    test('looks into the bag and reads its herbs', async () => {
        const { client, push } = setup();
        const result = inspectHerbBag(client as never, 'swojego zamknietego woreczka');
        await flush();
        expect(client.sendCommand).toHaveBeenCalledWith('zajrzyj do swojego zamknietego woreczka');
        push('Rozwiazujesz na chwile rzemyk, sprawdzajac zawartosc swojego zamknietego woreczka. W srodku dostrzegasz dwa zolte jasne kwiaty, wiele zlocistopomaranczowych duzych kwiatow i gruby szarawy grzyb.');
        await expect(result).resolves.toEqual({
            herbs: { deliona: 2, arnika: 30, 'gruby szarawy grzyb': 1 },
            total: 33,
            empty: false,
            unknown: ['gruby szarawy grzyb'],
        });
    });

    test('reports an empty bag', async () => {
        const { client, push } = setup();
        const result = inspectHerbBag(client as never, '2. swojego woreczka');
        await flush();
        push('Rozwiazujesz na chwile rzemyk, sprawdzajac zawartosc swojego woreczka. W jego srodku nic jednak nie ma.');
        await expect(result).resolves.toEqual({ herbs: {}, total: 0, empty: true, unknown: [] });
    });

    test('null when there is no such bag', async () => {
        const { client, push } = setup();
        const result = inspectHerbBag(client as never, 'swojego woreczka');
        await flush();
        push('Zajrzyj do czego?');
        await expect(result).resolves.toBeNull();
    });

    test('null when nothing arrives in time', async () => {
        jest.useFakeTimers();
        const { client } = setup();
        const result = inspectHerbBag(client as never, 'swojego woreczka', { timeout: 100 });
        await vi.advanceTimersByTimeAsync(100);
        await expect(result).resolves.toBeNull();
    });

    test('rejects when aborted', async () => {
        const { client } = setup();
        const controller = new AbortController();
        const result = inspectHerbBag(client as never, 'swojego woreczka', { signal: controller.signal });
        await flush();
        controller.abort();
        await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    });
});
