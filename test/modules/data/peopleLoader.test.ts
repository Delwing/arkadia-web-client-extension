import { refresh, subscribe, forceRefresh } from '@modules/data/peopleStore';
import { characterStorage } from '@modules/core/storage';
import {
    clearLocalEvents,
    editPerson,
    getMergedSnapshot,
    loadPeople,
    makePersonKey,
    setPersonLocation,
    subscribeMerged,
} from '@modules/data/peopleLoader';

vi.mock('@modules/data/peopleStore', () => ({
    subscribe: jest.fn(),
    refresh: jest.fn(),
    forceRefresh: jest.fn(),
    clear: jest.fn(),
}));

const subscribeMock = subscribe as jest.MockedFunction<typeof subscribe>;
const refreshMock = refresh as jest.MockedFunction<typeof refresh>;
const forceRefreshMock = forceRefresh as jest.MockedFunction<typeof forceRefresh>;

const MOCK_PEOPLE = [
    { name: 'Mara', description: 'niska kobieta', guild: 'NPC' },
    { name: 'Eamon', description: 'wysoki mezczyzna', guild: 'CKN' },
];

const maraKey = makePersonKey('Mara', 'niska kobieta');
const find = (name: string, description: string) =>
    getMergedSnapshot()?.find(p => makePersonKey(p.name, p.description) === makePersonKey(name, description));

describe('people locations', () => {
    beforeEach(async () => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        const subscribers: Array<(snapshot: typeof MOCK_PEOPLE | undefined) => void> = [];
        subscribeMock.mockReset().mockImplementation((listener) => {
            subscribers.push(listener as (snapshot: typeof MOCK_PEOPLE | undefined) => void);
            return () => undefined;
        });
        const emit = async () => {
            subscribers.forEach(listener => listener(MOCK_PEOPLE));
            return MOCK_PEOPLE;
        };
        refreshMock.mockReset().mockImplementation(emit);
        forceRefreshMock.mockReset().mockImplementation(emit);
        subscribeMerged(() => undefined);
        await loadPeople();
        clearLocalEvents();
    });

    it('stores the room on the merged entry', () => {
        setPersonLocation(maraKey, 1203);

        expect(find('Mara', 'niska kobieta')?.location).toBe(1203);
    });

    it('replaces the room when set again and removes it when cleared', () => {
        setPersonLocation(maraKey, 1203);
        setPersonLocation(maraKey, 4);
        expect(find('Mara', 'niska kobieta')?.location).toBe(4);

        setPersonLocation(maraKey, null);
        expect(find('Mara', 'niska kobieta')?.location).toBeUndefined();
    });

    it('keeps the room through an edit, and can clear it on the new key', () => {
        setPersonLocation(maraKey, 1203);
        editPerson(maraKey, { name: 'Mara', description: 'niska ruda kobieta', guild: 'NPC' });

        expect(find('Mara', 'niska ruda kobieta')?.location).toBe(1203);

        setPersonLocation(makePersonKey('Mara', 'niska ruda kobieta'), null);
        expect(find('Mara', 'niska ruda kobieta')?.location).toBeUndefined();
    });

    it('persists the location as a local edit event', () => {
        setPersonLocation(maraKey, 1203);

        const stored = characterStorage.get('peopleLocalEvents');
        expect(stored.events).toEqual([expect.objectContaining({ type: 'set-location', targetKey: maraKey, location: 1203 })]);
    });
});
