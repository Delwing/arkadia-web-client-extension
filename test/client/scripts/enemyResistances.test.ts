import initEnemyResistances, {
    parseResistanceTraits,
    parseComparisonName,
    resolveFromObjects,
} from '@client/scripts/enemyResistances';
import initParryShieldEvaluation from '@client/scripts/parryShieldEvaluation';
import {
    ensureEnemyResistancesLoaded,
    damageTypeOf,
    enemyKind,
    findEnemyResistance,
    getEnemyResistanceSnapshot,
    groupEnemyResistances,
    __resetEnemyResistanceStoreForTests,
} from '@modules/data/enemyResistanceStore';
import { storeInIndexedDB, getFromIndexedDB } from '@client/utils/dataCache';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';

async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

type Obj = { num: number; desc?: string; __category?: string };

class FakeClient {
    Triggers = new Triggers(({} as unknown) as any);
    areaNames: Record<string, string> = { '1': 'Vatt ghern', '2': 'Kopalnia' };
    Map = {
        currentRoom: { id: 7 } as { id: number; area?: number },
        getAreaName: (id: string) => this.areaNames[id],
    };
    objects: Obj[] = [];
    ObjectManager = { getObjectsOnLocation: () => this.objects };
    print = jest.fn();
    println = jest.fn();
    aliases: { pattern: RegExp; callback: Function }[] = [];
}

describe('parseResistanceTraits', () => {
    it('parses a single resistance list', () => {
        expect(parseResistanceTraits('wyjatkowo odporny na magie zycia i zimno')).toEqual([
            { kind: 'odporny', target: 'magie zycia' },
            { kind: 'odporny', target: 'zimno' },
        ]);
    });

    it('parses comma lists', () => {
        expect(parseResistanceTraits('wyjatkowo odporny na magie umyslu, magie zycia i zywiol ziemi')?.map(t => t.target))
            .toEqual(['magie umyslu', 'magie zycia', 'zywiol ziemi']);
    });

    it('splits resistances and vulnerabilities joined by oraz', () => {
        expect(parseResistanceTraits('wyjatkowo odporny na kwas i magie zycia oraz wrazliwy na zywiol ognia')).toEqual([
            { kind: 'odporny', target: 'kwas' },
            { kind: 'odporny', target: 'magie zycia' },
            { kind: 'wrazliwy', target: 'zywiol ognia' },
        ]);
    });

    it('handles feminine forms and vulnerability only', () => {
        expect(parseResistanceTraits('wyjatkowo odporna na bronie niemagiczne i magie zycia')?.map(t => t.target))
            .toEqual(['bronie niemagiczne', 'magie zycia']);
        expect(parseResistanceTraits('wrazliwy na magie umyslu')).toEqual([
            { kind: 'wrazliwy', target: 'magie umyslu' },
        ]);
    });

    it('rejects non-resistance phrases', () => {
        expect(parseResistanceTraits('wyjatkowo skuteczna w parowaniu ciosow')).toBeNull();
    });
});

describe('enemyKind', () => {
    it.each([
        ['wielka krwiozercza kikimora', 'kikimora'],
        ['czerwonoskory muskularny skaven', 'skaven'],
        ['golem', 'golem'],
        ['wielki ognisty zywiolak ognia', 'zywiolak ognia'],
        ['ponury troll jaskiniowy', 'troll jaskiniowy'],
        ['maly szkielet orka', 'szkielet orka'],
    ])('%s -> %s', (name, kind) => {
        expect(enemyKind(name)).toBe(kind);
    });
});

describe('damageTypeOf', () => {
    it.each([
        ['bronie niemagiczne', 'bronie niemagiczne'],
        ['magie zycia', 'magia zycia'],
        ['magie umyslu', 'magia umyslu'],
        ['czysta magie', 'czysta magia'],
        ['magie smierci', 'magia smierci'],
        ['zywiol ognia', 'ogien'],
        ['ogien', 'ogien'],
        ['zywiol ziemi', 'ziemia'],
        ['zywiol wody', 'woda'],
        ['zywiol powietrza', 'powietrze'],
        ['zimno', 'zimno'],
        ['kwas', 'kwas'],
        ['trucizne', 'trucizna'],
        ['spaczenie', 'spaczenie'],
        ['obrazenia obuchowe', 'obuchowe'],
    ])('%s -> %s', (target, key) => {
        expect(damageTypeOf(target)).toBe(key);
    });

    it('returns null for unknown phrases', () => {
        expect(damageTypeOf('smoczy oddech')).toBeNull();
    });
});

describe('helpers', () => {
    it('extracts nominative from comparison line', () => {
        expect(parseComparisonName(
            'Wydaje ci sie, ze jestes duzo silniejsza (-5), znacznie lepiej zbudowana (-4) i zreczniejsza (-3) niz szczeciniasty sepleniacy szczurolak.',
        )).toBe('szczeciniasty sepleniacy szczurolak');
        expect(parseComparisonName(
            'Wydaje ci sie, ze jestes duzo silniejszy, znacznie lepiej zbudowany i niewiele zreczniejszy niz czerwonoskory muskularny skaven.',
        )).toBe('czerwonoskory muskularny skaven');
    });

    it('resolves declined name against location objects, skipping team', () => {
        const objects = [
            { desc: 'Pablo', __category: 'team' },
            { desc: 'maly troll', __category: 'rest' },
            { desc: 'starozytny golem', __category: 'rest' },
        ];
        expect(resolveFromObjects('starozytnego golema', objects)).toBe('starozytny golem');
        expect(resolveFromObjects('wielkiego smoka', objects)).toBeNull();
    });
});

describe('groupEnemyResistances', () => {
    const entry = (
        name: string,
        target: string,
        area: { areaId: number | null; areaName: string | null },
    ) => ({
        name,
        traits: [{ kind: 'odporny' as const, target }],
        raw: `wyjatkowo odporny na ${target}`,
        roomId: 1,
        updatedAt: 1,
        ...area,
    });

    it('ignores trait order when comparing areas', () => {
        const traits = (targets: string[]) => targets.map(t => ({ kind: 'odporny' as const, target: t }));
        const base = { name: 'fimir', raw: '', roomId: 1, updatedAt: 1, areaName: null };
        const groups = groupEnemyResistances([
            { ...base, areaId: 1, traits: traits(['kwas', 'zimno']) },
            { ...base, areaId: 2, traits: traits(['zimno', 'kwas']) },
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0].areaLabel).toBeNull();
    });

    it('labels an entry captured before areas were tracked', () => {
        const groups = groupEnemyResistances([
            entry('fimir', 'kwas', { areaId: null, areaName: null }),
            entry('fimir', 'zimno', { areaId: 2, areaName: 'Kopalnia' }),
        ]);
        expect(groups.map(g => g.areaLabel)).toEqual(['Kopalnia', 'nieznany obszar']);
        expect(groups.map(g => g.hasUnknownArea)).toEqual([false, true]);
    });

    it('flags a missing area even when the kind is not split', () => {
        const groups = groupEnemyResistances([
            entry('fimir', 'kwas', { areaId: null, areaName: null }),
            entry('fimir', 'kwas', { areaId: 2, areaName: 'Kopalnia' }),
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0].areaLabel).toBeNull();
        expect(groups[0].hasUnknownArea).toBe(true);
    });

    it('falls back to the area id when the name is unknown', () => {
        const groups = groupEnemyResistances([
            entry('fimir', 'kwas', { areaId: 5, areaName: null }),
            entry('fimir', 'zimno', { areaId: 2, areaName: 'Kopalnia' }),
        ]);
        expect(groups.map(g => g.areaLabel)).toEqual(['Kopalnia', 'obszar #5']);
    });

    it('keeps the newest traits when folding areas together', () => {
        const groups = groupEnemyResistances([
            { ...entry('fimir', 'kwas', { areaId: 1, areaName: 'A' }), updatedAt: 10 },
            { ...entry('fimir', 'kwas', { areaId: 2, areaName: 'B' }), updatedAt: 20 },
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0].updatedAt).toBe(20);
        expect(groups[0].entries).toHaveLength(2);
    });
});

describe('stored entry migration', () => {
    // Mirrors the store's own IndexedDB config, which it keeps private.
    const CONFIG = { dbName: 'ArkadiaEnemyResistances', storeName: 'resistances', key: 'snapshot' };

    afterEach(async () => {
        await __resetEnemyResistanceStoreForTests();
    });

    it('drops the stale degree, fills in the area and rewrites the record', async () => {
        await __resetEnemyResistanceStoreForTests();
        await storeInIndexedDB(CONFIG, {
            entries: [{
                name: 'fimir',
                traits: [{ kind: 'odporny', degree: 'wyjatkowo', target: 'kwas' }],
                raw: 'wyjatkowo odporny na kwas',
                roomId: 3,
                updatedAt: 1,
            }],
        });
        await ensureEnemyResistancesLoaded();

        const entry = getEnemyResistanceSnapshot().entries[0];
        expect(entry.traits).toEqual([{ kind: 'odporny', target: 'kwas' }]);
        expect(entry).toMatchObject({ areaId: null, areaName: null });

        const stored = await getFromIndexedDB<{ entries: { traits: object[] }[] }>(CONFIG);
        expect(stored?.entries[0].traits[0]).not.toHaveProperty('degree');
    });
});

describe('enemyResistances script', () => {
    let client: FakeClient;
    let parse: (line: string) => AnsiAwareBuffer | null;

    beforeEach(async () => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        await __resetEnemyResistanceStoreForTests();
        client = new FakeClient();
        initEnemyResistances((client as unknown) as any, client.aliases);
        initParryShieldEvaluation((client as unknown) as any);
        await ensureEnemyResistancesLoaded();
        parse = (line: string) =>
            Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    });

    afterEach(async () => {
        await __resetEnemyResistanceStoreForTests();
    });

    it('stores a full evaluation', async () => {
        parse('Ogladasz dokladnie wielka krwiozercza kikimore.');
        parse('Stworzenie owo posiada pokryty czarnym, chropowatym i polyskujacym pancerzem tulow.');
        parse('Walczy z toba.');
        parse('Zdaje sie byc w swietnej kondycji.');
        parse('Wydaje ci sie, ze jestes znacznie silniejsza (-4), duzo lepiej zbudowana (-5) i troche zreczniejsza (-2) niz wielka krwiozercza kikimora.');
        parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest ona wyjatkowo odporna na bronie niemagiczne i magie zycia.');
        parse('Walczac z tym przeciwnikiem moglabys dowiedziec sie czegos wiecej o pajakach i pajakowatych oraz o stworach pokoniunkcyjnych.');
        await flush();

        const entry = findEnemyResistance('wielka krwiozercza kikimora');
        expect(entry).toMatchObject({
            name: 'kikimora',
            roomId: 7,
        });
        expect(entry?.traits.map(t => t.target)).toEqual(['bronie niemagiczne', 'magie zycia']);
    });

    it('stores without header when comparison line is present', async () => {
        parse('Walczy z Khurgiem.');
        parse('Wydaje ci sie, ze jestes duzo silniejszy, znacznie lepiej zbudowany i niewiele zreczniejszy niz czerwonoskory muskularny skaven.');
        parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on wrazliwy na magie umyslu.');
        await flush();

        expect(findEnemyResistance('czerwonoskory muskularny skaven')?.traits).toEqual([
            { kind: 'wrazliwy', target: 'magie umyslu' },
        ]);
    });

    it('falls back to location objects when comparison line is missing', async () => {
        client.objects = [{ num: 1, desc: 'starozytny golem', __category: 'rest' }];
        parse('Oceniasz starozytnego golema.');
        parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on wyjatkowo odporny na magie umyslu, magie zycia i zywiol ziemi.');
        await flush();

        expect(findEnemyResistance('starozytny golem')?.traits).toHaveLength(3);
    });

    it('ignores resistance lines without an evaluation context', async () => {
        parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on wyjatkowo odporny na magie zycia.');
        await flush();
        expect(getEnemyResistanceSnapshot().entries).toHaveLength(0);
    });

    it('does not store players', async () => {
        parse('Wydaje ci sie, ze jestes troche slabszy niz Khurg.');
        parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on wyjatkowo odporny na magie zycia.');
        await flush();
        expect(getEnemyResistanceSnapshot().entries).toHaveLength(0);
    });

    it('does not treat shield parry evaluation as resistances', async () => {
        parse('Oceniasz starannie ciezka tarcze.');
        parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest ona wyjatkowo skuteczna w parowaniu ciosow.');
        await flush();
        expect(getEnemyResistanceSnapshot().entries).toHaveLength(0);
    });

    it('warns with a copy link when the resistance phrase cannot be parsed', async () => {
        const writeText = jest.fn(() => Promise.resolve());
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        const gameLine = 'Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on zupelnie nowym tekstem.';

        parse('Wydaje ci sie, ze jestes duzo silniejsza (-5) niz dziwny stwor.');
        const out = parse(gameLine)!;
        await flush();

        expect(out.text).toContain('[odpornosci] Nie udalo sie odczytac odpornosci');
        expect(getEnemyResistanceSnapshot().entries).toHaveLength(0);

        const warnStart = out.text.indexOf('[odpornosci]');
        out.getStateAt(warnStart)?.hyperlink?.onClick?.({} as MouseEvent);
        expect(writeText).toHaveBeenCalledWith(gameLine);
    });

    it('warns when the enemy cannot be identified', async () => {
        client.objects = [];
        parse('Oceniasz starozytnego golema.');
        const out = parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on wyjatkowo odporny na magie zycia.')!;
        await flush();

        expect(out.text).toContain('Nie udalo sie rozpoznac przeciwnika');
        expect(getEnemyResistanceSnapshot().entries).toHaveLength(0);
    });

    it('does not warn for item evaluations right after an enemy evaluation', () => {
        parse('Wydaje ci sie, ze jestes duzo silniejsza (-5) niz ogoniasty mizerny fimir.');
        parse('Oceniasz starannie ciezka tarcze.');
        const out = parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest ona wyjatkowo skuteczna w parowaniu ciosow.');
        expect(out?.text ?? '').not.toContain('[odpornosci]');
    });

    it('does not warn for players', () => {
        parse('Wydaje ci sie, ze jestes troche slabszy niz Khurg.');
        const out = parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on wyjatkowo odporny na magie zycia.')!;
        expect(out.text).not.toContain('[odpornosci]');
    });

    it('re-evaluation overwrites traits', async () => {
        parse('Wydaje ci sie, ze jestes duzo zreczniejsza (-5) niz szkieletowaty zaniedbany formit.');
        parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on wyjatkowo odporny na kwas.');
        parse('Wydaje ci sie, ze jestes duzo zreczniejsza (-5) niz szkieletowaty zaniedbany formit.');
        parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on wyjatkowo odporny na kwas i magie zycia oraz wrazliwy na zywiol ognia.');
        await flush();

        const entries = getEnemyResistanceSnapshot().entries;
        expect(entries).toHaveLength(1);
        expect(entries[0].traits).toHaveLength(3);
    });

    it('merges enemies that differ only by adjectives', async () => {
        parse('Wydaje ci sie, ze jestes duzo zreczniejsza (-5) niz szkieletowaty zaniedbany formit.');
        parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on wyjatkowo odporny na kwas.');
        parse('Wydaje ci sie, ze jestes duzo zreczniejsza (-5) niz wysoki czarny formit.');
        parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on wyjatkowo odporny na kwas i magie zycia.');
        await flush();

        const entries = getEnemyResistanceSnapshot().entries;
        expect(entries.map(e => e.name)).toEqual(['formit']);
        expect(entries[0].traits).toHaveLength(2);
    });

    it('captures the area the evaluation happened in', async () => {
        client.Map.currentRoom = { id: 7, area: 1 };
        parse('Wydaje ci sie, ze jestes duzo silniejsza (-5) niz ogoniasty mizerny fimir.');
        parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on wyjatkowo odporny na kwas.');
        await flush();

        expect(findEnemyResistance('fimir')).toMatchObject({ areaId: 1, areaName: 'Vatt ghern' });
    });

    it('keeps one row for a kind with the same resistances in two areas', async () => {
        for (const area of [1, 2]) {
            client.Map.currentRoom = { id: 7, area };
            parse('Wydaje ci sie, ze jestes duzo silniejsza (-5) niz ogoniasty mizerny fimir.');
            parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on wyjatkowo odporny na kwas.');
        }
        await flush();

        expect(getEnemyResistanceSnapshot().entries).toHaveLength(2);
        const groups = groupEnemyResistances(getEnemyResistanceSnapshot().entries);
        expect(groups).toHaveLength(1);
        expect(groups[0].areaLabel).toBeNull();
        expect(groups[0].entries.map(e => e.areaId)).toEqual([1, 2]);
    });

    it('splits a kind whose resistances differ between areas, labelling each area', async () => {
        client.Map.currentRoom = { id: 7, area: 1 };
        parse('Wydaje ci sie, ze jestes duzo silniejsza (-5) niz ogoniasty mizerny fimir.');
        parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on wyjatkowo odporny na kwas.');
        client.Map.currentRoom = { id: 9, area: 2 };
        parse('Wydaje ci sie, ze jestes duzo silniejsza (-5) niz ogoniasty mizerny fimir.');
        parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on wrazliwy na zywiol ognia.');
        await flush();

        const groups = groupEnemyResistances(getEnemyResistanceSnapshot().entries);
        expect(groups.map(g => g.areaLabel)).toEqual(['Kopalnia', 'Vatt ghern']);
        expect(groups.map(g => g.traits[0].target)).toEqual(['zywiol ognia', 'kwas']);
    });

    it('re-evaluation in the same area overwrites instead of adding a row', async () => {
        client.Map.currentRoom = { id: 7, area: 1 };
        parse('Wydaje ci sie, ze jestes duzo silniejsza (-5) niz ogoniasty mizerny fimir.');
        parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on wyjatkowo odporny na kwas.');
        parse('Wydaje ci sie, ze jestes duzo silniejsza (-5) niz ogoniasty mizerny fimir.');
        parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on wrazliwy na zywiol ognia.');
        await flush();

        const entries = getEnemyResistanceSnapshot().entries;
        expect(entries).toHaveLength(1);
        expect(entries[0].traits[0].target).toBe('zywiol ognia');
    });

    it('/odpornosci marks the area only for a kind that differs between areas', async () => {
        client.Map.currentRoom = { id: 7, area: 1 };
        parse('Wydaje ci sie, ze jestes duzo silniejsza (-5) niz ogoniasty mizerny fimir.');
        parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on wyjatkowo odporny na kwas.');
        client.Map.currentRoom = { id: 9, area: 2 };
        parse('Wydaje ci sie, ze jestes duzo silniejsza (-5) niz ogoniasty mizerny fimir.');
        parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on wrazliwy na zywiol ognia.');
        await flush();

        const alias = client.aliases.find(a => a.pattern.test('/odpornosci fimir'))!;
        alias.callback('/odpornosci fimir'.match(alias.pattern));
        const printed = client.println.mock.calls[0][0] as AnsiAwareBuffer;
        expect(printed.text).toContain('[Kopalnia]');
        expect(printed.text).toContain('[Vatt ghern]');
    });

    it('/odpornosci lists entries filtered by phrase', async () => {
        parse('Wydaje ci sie, ze jestes duzo silniejsza (-5) niz ogoniasty mizerny fimir.');
        parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on wyjatkowo odporny na magie zycia.');
        await flush();

        const alias = client.aliases.find(a => a.pattern.test('/odpornosci fimir'))!;
        alias.callback('/odpornosci fimir'.match(alias.pattern));
        const printed = client.println.mock.calls[0][0] as AnsiAwareBuffer;
        expect(printed.text).toContain('fimir: odporny na magie zycia');
        // The fake client has no area on its room, so the entry is flagged.
        expect(printed.text).toContain('(bez obszaru)');
    });
});
