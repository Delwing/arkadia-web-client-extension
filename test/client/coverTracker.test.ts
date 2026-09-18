import {
    createCoverTracker,
    COVER_MAX_AGE_MS,
    type CoverEdge,
    type CoverLogEntry,
    type CoverStateSnapshot,
    type CoverTracker,
} from '@client/scripts/coverTracker';
import { matchCoverLine, resolveObjectId } from '@client/coverPatterns';

type Obj = { num: number; desc?: string; __category?: string };

const PLAYER_NUM = 659862;

/** The cast from the recording: player + the coverer + the covered mob. */
const RECORDING_OBJECTS: Obj[] = [
    { num: PLAYER_NUM, desc: 'Abra', __category: 'player' },
    { num: 605050, desc: 'grozny porywczy zolnierz', __category: 'rest' },
    { num: 605056, desc: 'zreczny ogromny zolnierz', __category: 'rest' },
];

interface Harness {
    tracker: CoverTracker;
    objects: Obj[];
    log: CoverLogEntry[];
    states: CoverStateSnapshot[];
    setNow(ms: number): void;
    /** Edges sorted into a stable order so assertions can compare arrays. */
    edges(): CoverEdge[];
    triple(): string[];
}

function harness(objects: Obj[], playerNum: number | undefined = PLAYER_NUM): Harness {
    const list = [...objects];
    const log: CoverLogEntry[] = [];
    const states: CoverStateSnapshot[] = [];
    let now = 1_000_000;

    const tracker = createCoverTracker({
        now: () => now,
        getObjects: () => list,
        getPlayerNum: () => playerNum,
        emitState: snapshot => states.push(snapshot),
        emitEvent: entry => log.push(entry),
    });

    return {
        tracker,
        objects: list,
        log,
        states,
        setNow: ms => { now = ms; },
        edges: () => [...tracker.getEdges()].sort((a, b) =>
            a.coveredId - b.coveredId || a.covererId - b.covererId || a.attackerId - b.attackerId),
        triple: () => [...tracker.getEdges()]
            .map(e => `${e.coveredId}:${e.covererId}:${e.attackerId}`)
            .sort(),
    };
}

const kinds = (log: CoverLogEntry[]) => log.map(e => e.kind);

describe('coverPatterns - grammar', () => {
    it('reads the cover line against the player', () => {
        const m = matchCoverLine(
            'Grozny porywczy zolnierz zrecznie zaslania zrecznego ogromnego zolnierza przed twoimi ciosami.');
        expect(m).toMatchObject({
            kind: 'established',
            coverer: 'Grozny porywczy zolnierz',
            covered: 'zrecznego ogromnego zolnierza',
            attackers: ['@ty'],
        });
    });

    it('splits the attacker list into one entry per attacker', () => {
        const m = matchCoverLine(
            'Zrecznie zaslaniasz Abra przed ciosami powaznego ciemnowlosego krasnoluda chaosu '
            + 'i ponurego ciemnowlosego krasnoluda chaosu.');
        expect(m?.kind).toBe('established');
        expect(m?.coverer).toBe('@ty');
        expect(m?.covered).toBe('Abra');
        expect(m?.attackers).toEqual([
            'powaznego ciemnowlosego krasnoluda chaosu',
            'ponurego ciemnowlosego krasnoluda chaosu',
        ]);
    });

    it('strips the prompt the game prefixes lines with', () => {
        expect(matchCoverLine('> > Przestajesz zaslaniac Abra.')).toMatchObject({
            kind: 'released', covered: 'Abra', coverer: '@ty',
        });
    });

    it('reads the "Na rozkaz" forms without mistaking the orderer for the coverer', () => {
        expect(matchCoverLine('Na rozkaz Abra zaslaniasz Pabla przed ciosami wielkiego trolla.'))
            .toMatchObject({ kind: 'established', coverer: '@ty', covered: 'Pabla' });
        const third = matchCoverLine(
            'Na rozkaz Abra grozny porywczy zolnierz zaslania Pabla przed ciosami wielkiego trolla.');
        expect(third).toMatchObject({
            kind: 'established',
            covered: 'Pabla',
            covererHasOrderPrefix: true,
        });
        // Grammar cannot split orderer from coverer - the resolver does, by suffix.
        expect(third?.coverer).toBe('Abra grozny porywczy zolnierz');
    });

    it('matches the three release lines', () => {
        expect(matchCoverLine('Przestajesz zaslaniac Abra.')).toMatchObject({ kind: 'released', coverer: '@ty' });
        expect(matchCoverLine('Grozny porywczy zolnierz przestaje cie zaslaniac przed ciosami wrogow.'))
            .toMatchObject({ kind: 'released', covered: '@ty', coverer: 'Grozny porywczy zolnierz' });
        expect(matchCoverLine('Grozny porywczy zolnierz przestaje zaslaniac Abra.'))
            .toMatchObject({ kind: 'released', covered: 'Abra', coverer: 'Grozny porywczy zolnierz' });
    });

    it('matches the retreat-behind lines as their own source', () => {
        expect(matchCoverLine(
            'Pabel unosi swoja tarcze i szybko przesuwa sie za Abra, kryjac sie przed atakami wielkiego trolla.'))
            .toMatchObject({ kind: 'retreat', source: 'retreat', covered: 'Pabel', coverer: 'Abra' });
        expect(matchCoverLine(
            'Pabel unosi swoja tarcze i szybko przesuwa sie za ciebie, kryjac sie przed atakami wielkiego trolla.'))
            .toMatchObject({ kind: 'retreat', covered: 'Pabel', coverer: 'ciebie' });
        expect(matchCoverLine('Sprytnie manewrujac Pabel kryje sie za plecami Abra przed atakami wielkiego trolla.'))
            .toMatchObject({ kind: 'retreat', covered: 'Pabel', coverer: 'Abra' });
        expect(matchCoverLine('Sprytnie manewrujac kryjesz sie za plecami Abra przed atakami wielkiego trolla.'))
            .toMatchObject({ kind: 'retreat', covered: '@ty', coverer: 'Abra' });
    });

    it('does not build on the known non-signals', () => {
        expect(matchCoverLine('Grozny porywczy zolnierz rozglada sie szybko, jakby szukajac pomocy.')).toBeNull();
        expect(matchCoverLine('Grozny porywczy zolnierz ocenia sytuacje.')).toBeNull();
        // Movement blocking is a different mechanic and a different verb (stoi/staje).
        expect(matchCoverLine('Wielki troll stoi ci na drodze.')).toBeNull();
    });
});

describe('resolveObjectId', () => {
    const objects: Obj[] = [
        { num: 1, desc: 'Vesper', __category: 'team' },
        { num: 2, desc: 'Pabel', __category: 'team' },
        { num: 3, desc: 'zreczny ogromny zolnierz', __category: 'rest' },
        { num: PLAYER_NUM, desc: 'Abra', __category: 'player' },
    ];

    it('matches a nominative desc exactly', () => {
        expect(resolveObjectId('zreczny ogromny zolnierz', objects, { playerNum: PLAYER_NUM }))
            .toEqual({ id: 3, ambiguous: false });
    });

    it('matches a declined mob desc', () => {
        expect(resolveObjectId('zrecznego ogromnego zolnierza', objects, { playerNum: PLAYER_NUM }))
            .toEqual({ id: 3, ambiguous: false });
    });

    it('matches a declined single-token player name', () => {
        // "Pabel" -> "Pabla" scores ~0.6 on a 5-char word with no siblings to
        // average against, which is why single-word candidates get a lower floor.
        expect(resolveObjectId('Pabla', objects, { playerNum: PLAYER_NUM }))
            .toEqual({ id: 2, ambiguous: false });
    });

    it('resolves the second-person pronouns straight to the player', () => {
        for (const pronoun of ['cie', 'ciebie', 'toba']) {
            expect(resolveObjectId(pronoun, objects, { playerNum: PLAYER_NUM }))
                .toEqual({ id: PLAYER_NUM, ambiguous: false });
        }
    });

    it('strips the brackets around introduced names', () => {
        expect(resolveObjectId('[Vesper]', objects, { playerNum: PLAYER_NUM }))
            .toEqual({ id: 1, ambiguous: false });
    });

    it('flags a duplicate-desc tie as ambiguous', () => {
        const dupes: Obj[] = [
            { num: 10, desc: 'ogromny zolnierz', __category: 'rest' },
            { num: 11, desc: 'ogromny zolnierz', __category: 'rest' },
        ];
        const result = resolveObjectId('ogromnego zolnierza', dupes, { playerNum: PLAYER_NUM });
        expect(result.ambiguous).toBe(true);
    });

    it('tells near-identical descs apart on the word that differs', () => {
        const krasnoludy: Obj[] = [
            { num: 20, desc: 'powazny ciemnowlosy krasnolud chaosu', __category: 'rest' },
            { num: 21, desc: 'ponury ciemnowlosy krasnolud chaosu', __category: 'rest' },
        ];
        expect(resolveObjectId('powaznego ciemnowlosego krasnoluda chaosu', krasnoludy))
            .toEqual({ id: 20, ambiguous: false });
        expect(resolveObjectId('ponurego ciemnowlosego krasnoluda chaosu', krasnoludy))
            .toEqual({ id: 21, ambiguous: false });
    });

    it('resolves the coverer out of a "Na rozkaz <orderer> <coverer>" capture', () => {
        const cast: Obj[] = [
            { num: 1, desc: 'Abra', __category: 'team' },
            { num: 2, desc: 'grozny porywczy zolnierz', __category: 'rest' },
        ];
        expect(resolveObjectId('Abra grozny porywczy zolnierz', cast, { trimLeadingWords: true }))
            .toEqual({ id: 2, ambiguous: false });
    });

    it('returns nothing rather than a bad guess', () => {
        expect(resolveObjectId('zupelnie kto inny gdzies indziej', objects).id).toBeUndefined();
    });
});

describe('coverTracker - text paths', () => {
    it('creates one confirmed edge from the cover line', () => {
        const h = harness(RECORDING_OBJECTS);
        expect(h.tracker.handleLine(
            'Grozny porywczy zolnierz zrecznie zaslania zrecznego ogromnego zolnierza przed twoimi ciosami.'))
            .toBe(true);
        expect(h.edges()).toHaveLength(1);
        expect(h.edges()[0]).toMatchObject({
            coveredId: 605056,
            covererId: 605050,
            attackerId: PLAYER_NUM,
            confidence: 'confirmed',
            source: 'cover-line',
        });
        expect(kinds(h.log)).toEqual(['established']);
        expect(h.states).toHaveLength(1);
    });

    it('fans a multi-attacker cover line out into one edge per attacker', () => {
        const h = harness([
            { num: PLAYER_NUM, desc: 'Vesper', __category: 'player' },
            { num: 1001, desc: 'Abra', __category: 'team' },
            { num: 2001, desc: 'powazny ciemnowlosy krasnolud chaosu', __category: 'rest' },
            { num: 2002, desc: 'ponury ciemnowlosy krasnolud chaosu', __category: 'rest' },
        ]);
        h.tracker.handleLine(
            'Zrecznie zaslaniasz Abra przed ciosami powaznego ciemnowlosego krasnoluda chaosu '
            + 'i ponurego ciemnowlosego krasnoluda chaosu.');

        const edges = h.edges();
        expect(edges).toHaveLength(2);
        expect(new Set(edges.map(e => e.coveredId))).toEqual(new Set([1001]));
        expect(new Set(edges.map(e => e.covererId))).toEqual(new Set([PLAYER_NUM]));
        // The two near-identical krasnoludy must land on DIFFERENT object ids.
        expect(new Set(edges.map(e => e.attackerId))).toEqual(new Set([2001, 2002]));
        expect(kinds(h.log)).toEqual(['established', 'established']);
    });

    it('creates no edge for a failed cover', () => {
        const h = harness(RECORDING_OBJECTS);
        h.tracker.handleLine(
            'Grozny porywczy zolnierz probuje zaslonic zrecznego ogromnego zolnierza '
            + 'przed twoimi ciosami, jednak nie jest w stanie tego uczynic.');
        expect(h.edges()).toHaveLength(0);
        expect(kinds(h.log)).toEqual(['failed']);
    });

    it('logs cover flavour that names no attacker instead of inventing a wildcard edge', () => {
        const h = harness(RECORDING_OBJECTS);
        h.tracker.handleLine(
            'Grozny porywczy zolnierz staje u jego boku, gotow w kazdej chwili zaslonic '
            + 'zrecznego ogromnego zolnierza przed nadchodzacym niebezpieczenstwem.');
        expect(h.edges()).toHaveLength(0);
        expect(kinds(h.log)).toEqual(['ambiguous']);
    });

    it('reads "staje pomiedzy A a B" as covered A, attacker B', () => {
        const h = harness([
            { num: PLAYER_NUM, desc: 'Vesper', __category: 'player' },
            { num: 1001, desc: 'Abra', __category: 'team' },
            { num: 2001, desc: 'wielki troll', __category: 'rest' },
        ]);
        h.tracker.handleLine('Z wprawa stajesz pomiedzy Abra a wielkim trollem, przyjmujac na siebie nadchodzace ciosy.');
        expect(h.edges()).toHaveLength(1);
        expect(h.edges()[0]).toMatchObject({ coveredId: 1001, covererId: PLAYER_NUM, attackerId: 2001 });
    });

    it('records the retreat mechanic as its own source in the same graph', () => {
        const h = harness([
            { num: PLAYER_NUM, desc: 'Vesper', __category: 'player' },
            { num: 1001, desc: 'Abra', __category: 'team' },
            { num: 1002, desc: 'Pabel', __category: 'team' },
            { num: 2001, desc: 'wielki troll', __category: 'rest' },
        ]);
        h.tracker.handleLine(
            'Pabel unosi swoja tarcze i szybko przesuwa sie za Abra, kryjac sie przed atakami wielkiego trolla.');
        expect(h.edges()).toHaveLength(1);
        expect(h.edges()[0]).toMatchObject({
            coveredId: 1002, covererId: 1001, attackerId: 2001, source: 'retreat',
        });
        expect(kinds(h.log)).toEqual(['retreat']);
    });

    it('creates no edge for a failed retreat', () => {
        const h = harness([
            { num: PLAYER_NUM, desc: 'Vesper', __category: 'player' },
            { num: 1002, desc: 'Pabel', __category: 'team' },
            { num: 2001, desc: 'wielki troll', __category: 'rest' },
        ]);
        h.tracker.handleLine(
            'Pabel unosi swoja tarcze i szybko przesuwa sie w twoja strone, '
            + 'bezskutecznie probujac uciec przed twoimi ciosami.');
        expect(h.edges()).toHaveLength(0);
        expect(kinds(h.log)).toEqual(['failed']);
    });

    it('clears the pair on a release line', () => {
        const h = harness(RECORDING_OBJECTS);
        h.tracker.handleLine(
            'Grozny porywczy zolnierz zrecznie zaslania zrecznego ogromnego zolnierza przed twoimi ciosami.');
        h.tracker.handleLine('Grozny porywczy zolnierz przestaje zaslaniac zrecznego ogromnego zolnierza.');
        expect(h.edges()).toHaveLength(0);
        expect(kinds(h.log)).toEqual(['established', 'released']);
    });
});

describe('coverTracker - the block line as its own test oracle', () => {
    const BLOCK = 'Rzucasz sie na zrecznego ogromnego zolnierza, lecz grozny porywczy zolnierz staje ci na drodze.';

    it('creates a confirmed edge from nothing and records that it was unknown', () => {
        const h = harness(RECORDING_OBJECTS);
        h.tracker.handleLine(BLOCK);
        expect(h.edges()).toHaveLength(1);
        expect(h.edges()[0]).toMatchObject({
            coveredId: 605056, covererId: 605050, attackerId: PLAYER_NUM,
            confidence: 'confirmed', source: 'block-line',
        });
        expect(h.log).toHaveLength(1);
        expect(h.log[0]).toMatchObject({ kind: 'blocked', wasKnown: false });
    });

    it('only refreshes after the establishing line, without duplicating the edge', () => {
        const h = harness(RECORDING_OBJECTS);
        h.setNow(1_000_000);
        h.tracker.handleLine(
            'Grozny porywczy zolnierz zrecznie zaslania zrecznego ogromnego zolnierza przed twoimi ciosami.');
        h.setNow(1_005_000);
        h.tracker.handleLine(BLOCK);

        expect(h.edges()).toHaveLength(1);
        expect(h.edges()[0]).toMatchObject({ since: 1_000_000, lastSeen: 1_005_000, source: 'cover-line' });
        expect(h.log[1]).toMatchObject({ kind: 'blocked', wasKnown: true });
    });

    it('resolves the third-person block form to the attacker and drops the pronoun', () => {
        const h = harness([
            { num: PLAYER_NUM, desc: 'Abra', __category: 'player' },
            { num: 1001, desc: 'Vesper', __category: 'team' },
            { num: 488206, desc: 'hardy blondwlosy mezczyzna', __category: 'rest' },
            { num: 488212, desc: 'potezny jasnowlosy mezczyzna', __category: 'rest' },
        ]);
        h.tracker.handleLine(
            'Vesper rzuca sie na hardego blondwlosego mezczyzne, lecz potezny jasnowlosy mezczyzna staje jej na drodze.');

        expect(h.edges()).toHaveLength(1);
        const edge = h.edges()[0];
        expect(edge).toMatchObject({ coveredId: 488206, covererId: 488212, attackerId: 1001 });
        // "staje jej na drodze" genders the ATTACKER; it must not reach the coverer.
        expect(edge.covererId).not.toBe(1001);
        expect(edge.attackerId).not.toBe(488212);
    });
});

describe('coverTracker - break semantics (1.4)', () => {
    /** One covered target, three different attackers blocked by one coverer. */
    function threeAttackers(): Harness {
        const h = harness([
            { num: PLAYER_NUM, desc: 'Abra', __category: 'player' },
            { num: 1001, desc: 'Vesper', __category: 'team' },
            { num: 1002, desc: 'Pabel', __category: 'team' },
            { num: 605050, desc: 'grozny porywczy zolnierz', __category: 'rest' },
            { num: 605056, desc: 'zreczny ogromny zolnierz', __category: 'rest' },
        ]);
        h.tracker.handleLine(
            'Grozny porywczy zolnierz zrecznie zaslania zrecznego ogromnego zolnierza przed twoimi ciosami.');
        h.tracker.handleLine(
            'Grozny porywczy zolnierz zaslania zrecznego ogromnego zolnierza przed ciosami Vespera i Pabla.');
        expect(h.triple()).toEqual([
            `605056:605050:1001`,
            `605056:605050:1002`,
            `605056:605050:${PLAYER_NUM}`,
        ].sort());
        return h;
    }

    it('a successful break frees the target for the whole team', () => {
        const h = threeAttackers();
        // Whoever broke it is irrelevant - a single break clears every edge.
        h.tracker.handleLine('Vesper rzuca sie na zrecznego ogromnego zolnierza przebijajac sie przez jego ochrone.');
        expect(h.edges()).toHaveLength(0);
        expect(h.log.at(-1)).toMatchObject({ kind: 'break-ok', coveredId: 605056 });
    });

    it('a failed break removes none of them', () => {
        const h = threeAttackers();
        h.setNow(1_002_000);
        h.tracker.handleLine(
            'Bezskutecznie rzucasz sie na zrecznego ogromnego zolnierza, probujac przebic sie przez jego ochrone.');
        expect(h.edges()).toHaveLength(3);
        // It names only the covered party, so it refreshes what we hold.
        expect(h.edges().every(e => e.lastSeen === 1_002_000)).toBe(true);
        expect(h.log.at(-1)).toMatchObject({ kind: 'break-failed' });
    });

    it('reachability is per-attacker, not a boolean on the object', () => {
        const h = harness([
            { num: PLAYER_NUM, desc: 'Abra', __category: 'player' },
            { num: 1001, desc: 'Vesper', __category: 'team' },
            { num: 605050, desc: 'grozny porywczy zolnierz', __category: 'rest' },
            { num: 605056, desc: 'zreczny ogromny zolnierz', __category: 'rest' },
        ]);
        h.tracker.handleLine(
            'Grozny porywczy zolnierz zaslania zrecznego ogromnego zolnierza przed ciosami Vespera.');

        expect(h.tracker.isCoveredFor(605056, 1001)).toBe(true);
        // Blocked for the teammate, wide open for the player.
        expect(h.tracker.isCoveredFor(605056, PLAYER_NUM)).toBe(false);
        expect(h.tracker.getCoveredForAttacker(1001)).toEqual([605056]);
        expect(h.tracker.getCoveredForAttacker(PLAYER_NUM)).toEqual([]);
    });
});

describe('coverTracker - GMCP corroboration (1.3)', () => {
    function seeded(): Harness {
        const h = harness(RECORDING_OBJECTS);
        h.tracker.handleObjectsNums([PLAYER_NUM, 605050, 605056]);
        h.tracker.handleObjectsData({ [PLAYER_NUM]: { attack_num: 605056 } });
        return h;
    }

    it('does not let "Juz walczysz z" clear anything while our own id is unknown', () => {
        const h = harness([...RECORDING_OBJECTS, { num: 1001, desc: 'Vesper', __category: 'team' }], undefined);
        // A cover line that names its attacker outright needs no id of our own.
        h.tracker.handleObjectsNums([PLAYER_NUM, 605050, 605056, 1001]);
        h.tracker.handleLine(
            'Grozny porywczy zolnierz zaslania zrecznego ogromnego zolnierza przed ciosami Vespera.');
        const before = h.triple();
        expect(before).toEqual(['605056:605050:1001']);

        h.tracker.handleLine('Juz walczysz z zrecznym ogromnym zolnierzem.');
        expect(h.triple()).toEqual(before);
    });

    it('records an attack_num flip as an observation, never as an edge', () => {
        const h = seeded();
        h.tracker.handleObjectsData({ [PLAYER_NUM]: { attack_num: 605050 } });
        // A flip is identical whether a cover redirected the blow or the attacker
        // simply chose a new target, so it may inform the log and nothing else.
        expect(h.edges()).toHaveLength(0);
        expect(h.log.at(-1)).toMatchObject({ kind: 'gmcp-suspect', raw: '' });
    });

    it('never paints a bystander as covered when somebody just retargets', () => {
        const h = harness([
            { num: PLAYER_NUM, desc: 'Abra', __category: 'player' },
            { num: 201, desc: 'Vesper', __category: 'team' },
            { num: 202, desc: 'Muzikuhr', __category: 'team' },
            { num: 301, desc: 'lysy rosly ogr', __category: 'rest' },
            { num: 302, desc: 'otyly mlody mezczyzna', __category: 'rest' },
        ]);
        h.tracker.handleObjectsNums([PLAYER_NUM, 201, 202, 301, 302]);
        h.tracker.handleLine('Muzikuhr zrecznie zaslania Vesper przed ciosami lysego roslego ogra.');
        expect(h.triple()).toEqual(['201:202:301']);

        // Vesper picks a different target of her own accord. The ogr she left is
        // NOT suddenly covered by the man she moved to.
        h.tracker.handleObjectsData({ 201: { attack_num: 301 } });
        h.tracker.handleObjectsData({ 201: { attack_num: 302 } });
        expect(h.triple()).toEqual(['201:202:301']);
        expect(h.tracker.isCoveredFor(301, 201)).toBe(false);
    });

    it('clears the cover on release even after an unrelated retarget', () => {
        const h = harness([
            { num: PLAYER_NUM, desc: 'Abra', __category: 'player' },
            { num: 201, desc: 'Vesper', __category: 'team' },
            { num: 203, desc: 'Pablo', __category: 'team' },
            { num: 301, desc: 'lysy rosly ogr', __category: 'rest' },
            { num: 302, desc: 'otyly mlody mezczyzna', __category: 'rest' },
        ]);
        h.tracker.handleObjectsNums([PLAYER_NUM, 201, 203, 301, 302]);
        h.tracker.handleLine('Pablo zrecznie zaslania Vesper przed ciosami otylego mlodego mezczyzny.');
        // A mob that was hitting Vesper switches off her. This used to mint a
        // phantom edge ALSO covering Vesper but with a different coverer, which the
        // release below could never clear - it keys on the pair, as it must.
        h.tracker.handleObjectsData({ 301: { attack_num: 201 } });
        h.tracker.handleObjectsData({ 301: { attack_num: 302 } });

        h.tracker.handleLine('Pablo przestaje zaslaniac Vesper.');
        expect(h.edges()).toHaveLength(0);
        expect(kinds(h.log)).toContain('released');
    });

    it('reads the identical flip as a death when the old target left objects.nums', () => {
        const h = seeded();
        // The kill packet: the old target drops out of nums in the same breath.
        h.tracker.handleObjectsNums([PLAYER_NUM, 605050]);
        h.tracker.handleObjectsData({ [PLAYER_NUM]: { attack_num: 605050 } });
        expect(h.edges()).toHaveLength(0);
        expect(kinds(h.log)).not.toContain('gmcp-suspect');
    });

    it('creates exactly one confirmed edge when text follows the flip it explains', () => {
        const h = seeded();
        h.tracker.handleObjectsData({ [PLAYER_NUM]: { attack_num: 605050 } });
        h.tracker.handleLine(
            'Grozny porywczy zolnierz zrecznie zaslania zrecznego ogromnego zolnierza przed twoimi ciosami.');
        expect(h.edges()).toHaveLength(1);
        expect(h.edges()[0]).toMatchObject({ confidence: 'confirmed', source: 'cover-line' });
    });

    it('stops logging a flip once an edge explains it', () => {
        const h = seeded();
        h.tracker.handleLine(
            'Grozny porywczy zolnierz zrecznie zaslania zrecznego ogromnego zolnierza przed twoimi ciosami.');
        h.tracker.handleObjectsData({ [PLAYER_NUM]: { attack_num: 605050 } });
        // The flip is exactly what that cover did to us - not worth reporting.
        expect(kinds(h.log)).not.toContain('gmcp-suspect');
    });

    it('drops an edge once a party leaves the room for good', () => {
        const h = harness(RECORDING_OBJECTS);
        h.tracker.handleObjectsNums([PLAYER_NUM, 605050, 605056]);
        h.tracker.handleLine(
            'Grozny porywczy zolnierz zrecznie zaslania zrecznego ogromnego zolnierza przed twoimi ciosami.');
        // Two strikes - one partial frame is not proof of absence.
        h.tracker.handleObjectsNums([PLAYER_NUM, 605056]);
        h.tracker.handleObjectsNums([PLAYER_NUM, 605056]);
        expect(h.edges()).toHaveLength(0);
        expect(h.log.at(-1)).toMatchObject({ kind: 'expired', reason: 'gone' });
    });
});

describe('coverTracker - expiry', () => {
    it('does not expire a cover just because nothing else was said about it', () => {
        const h = harness(RECORDING_OBJECTS);
        h.setNow(0);
        h.tracker.handleLine(
            'Grozny porywczy zolnierz zrecznie zaslania zrecznego ogromnego zolnierza przed twoimi ciosami.');
        // A cover has no duration of its own. Silence is not the end of it.
        for (let t = 1000; t < COVER_MAX_AGE_MS; t += 10000) {
            h.setNow(t);
            h.tracker.tick(t);
        }
        expect(h.edges()).toHaveLength(1);
        expect(kinds(h.log)).not.toContain('expired');
    });

    it('drops every edge a dead party was part of', () => {
        const h = harness(RECORDING_OBJECTS);
        h.tracker.handleLine(
            'Grozny porywczy zolnierz zrecznie zaslania zrecznego ogromnego zolnierza przed twoimi ciosami.');
        h.tracker.handleLine('Zreczny ogromny zolnierz umarl.');
        expect(h.edges()).toHaveLength(0);
        expect(h.log.at(-1)).toMatchObject({ kind: 'expired' });
    });

    it('clears a coverer\'s edges through the stun hook', () => {
        const h = harness(RECORDING_OBJECTS);
        h.tracker.handleLine(
            'Grozny porywczy zolnierz zrecznie zaslania zrecznego ogromnego zolnierza przed twoimi ciosami.');
        h.tracker.clearEdgesFor(605050, 'stun');
        expect(h.edges()).toHaveLength(0);
    });
});

describe('coverTracker - why an edge went away', () => {
    const COVER_LINE =
        'Grozny porywczy zolnierz zrecznie zaslania zrecznego ogromnego zolnierza przed twoimi ciosami.';

    it('names the ceiling, the only limit an edge has', () => {
        const h = harness(RECORDING_OBJECTS);
        h.setNow(0);
        h.tracker.handleLine(COVER_LINE);
        h.tracker.tick(COVER_MAX_AGE_MS + 1);
        expect(h.log.at(-1)).toMatchObject({ kind: 'expired', reason: 'max-age' });
    });

    it('names the death, and who died', () => {
        const h = harness(RECORDING_OBJECTS);
        h.tracker.handleLine(COVER_LINE);
        h.tracker.handleLine('Zreczny ogromny zolnierz umarl.');
        expect(h.log.at(-1)).toMatchObject({ kind: 'expired', reason: 'death' });
    });

    it('names who dropped out of the room', () => {
        const h = harness(RECORDING_OBJECTS);
        h.tracker.handleObjectsNums([PLAYER_NUM, 605050, 605056]);
        h.tracker.handleLine(COVER_LINE);
        h.tracker.handleObjectsNums([PLAYER_NUM, 605050]);
        h.tracker.handleObjectsNums([PLAYER_NUM, 605050]);
        expect(h.log.at(-1)).toMatchObject({
            kind: 'expired', reason: 'gone', missingIds: [605056],
        });
    });

    it('survives a single partial objects.nums frame', () => {
        const h = harness(RECORDING_OBJECTS);
        h.tracker.handleObjectsNums([PLAYER_NUM, 605050, 605056]);
        h.tracker.handleLine(COVER_LINE);

        // One frame without the covered mob is not proof it left.
        h.tracker.handleObjectsNums([PLAYER_NUM, 605050]);
        expect(h.edges()).toHaveLength(1);
        h.tracker.handleObjectsNums([PLAYER_NUM, 605050, 605056]);
        h.tracker.handleObjectsNums([PLAYER_NUM, 605050]);
        expect(h.edges()).toHaveLength(1);
    });

    it('survives a frame that is briefly missing our own object num', () => {
        const h = harness(RECORDING_OBJECTS);
        h.tracker.handleObjectsNums([PLAYER_NUM, 605050, 605056]);
        h.tracker.handleLine(COVER_LINE);
        // attackerId is US - one frame without our num used to wipe every edge.
        h.tracker.handleObjectsNums([605050, 605056]);
        expect(h.edges()).toHaveLength(1);
    });
});

describe('coverTracker - standing GMCP corroboration', () => {
    const COVER_LINE =
        'Grozny porywczy zolnierz zrecznie zaslania zrecznego ogromnego zolnierza przed twoimi ciosami.';

    function established(): Harness {
        const h = harness(RECORDING_OBJECTS);
        h.setNow(0);
        h.tracker.handleObjectsNums([PLAYER_NUM, 605050, 605056]);
        h.tracker.handleObjectsData({ [PLAYER_NUM]: { attack_num: 605056 } });
        h.tracker.handleLine(COVER_LINE);
        h.tracker.handleObjectsData({ [PLAYER_NUM]: { attack_num: 605050 } });
        return h;
    }

    it('keeps the edge alive across the 22 s the recording spends without a poke', () => {
        const h = established();
        // In the recording our attack_num sat on the coverer from t=73483 to
        // t=95511 with the covered mob still listed - the cover was up the whole
        // time, and the only refreshes came from the player's own /prze pokes.
        for (let t = 1000; t <= 22000; t += 1000) {
            h.setNow(t);
            h.tracker.handleObjectsNums([PLAYER_NUM, 605050, 605056]);
            h.tracker.tick(t);
        }
        expect(h.edges()).toHaveLength(1);
        expect(h.log.filter(e => e.kind === 'expired')).toHaveLength(0);
    });

    it('is sustained by an hp-only delta, because the fingerprint is accumulated', () => {
        const h = established();
        for (let t = 1000; t <= 18000; t += 1000) {
            h.setNow(t);
            // A delta carrying no attack_num at all must not break corroboration.
            h.tracker.handleObjectsData({ 605050: { hp: 4 } as any });
            h.tracker.tick(t);
        }
        expect(h.edges()).toHaveLength(1);
    });

    it('survives the attacker retargeting - only a line ends a cover', () => {
        const h = established();
        const EDGE = `605056:605050:${PLAYER_NUM}`;
        h.setNow(2000);
        // Swinging elsewhere does not lift a cover, and nothing in the protocol
        // says it did. It stands until broken, released, superseded or somebody dies.
        h.tracker.handleObjectsData({ [PLAYER_NUM]: { attack_num: 605056 } });
        h.tracker.tick(2000);
        expect(h.triple()).toContain(EDGE);

        h.setNow(120000);
        h.tracker.tick(120000);
        expect(h.triple()).toContain(EDGE);
        expect(kinds(h.log)).not.toContain('expired');
    });

    it('still bounds an edge the fingerprint would otherwise sustain forever', () => {
        const h = established();

        // Corroborated right up to the ceiling, so `lastSeen` is fresh and the
        // ordinary TTL cannot be what removes it.
        const almost = COVER_MAX_AGE_MS - 1000;
        h.setNow(almost);
        h.tracker.handleObjectsNums([PLAYER_NUM, 605050, 605056]);
        h.tracker.tick(almost);
        expect(h.edges()).toHaveLength(1);

        const past = COVER_MAX_AGE_MS + 1;
        h.setNow(past);
        h.tracker.handleObjectsNums([PLAYER_NUM, 605050, 605056]);
        h.tracker.tick(past);
        expect(h.edges()).toHaveLength(0);
        expect(h.log.at(-1)).toMatchObject({ kind: 'expired', reason: 'max-age' });
    });

    it('sustains a cover across ten minutes of fighting the coverer', () => {
        const h = established();
        // A cover lasts until it is broken, released, or somebody dies - none of
        // which happen here - so nothing may quietly time it out in between.
        for (let t = 10000; t < COVER_MAX_AGE_MS; t += 10000) {
            h.setNow(t);
            h.tracker.handleObjectsNums([PLAYER_NUM, 605050, 605056]);
            h.tracker.tick(t);
        }
        expect(h.edges()).toHaveLength(1);
        expect(h.log.filter(e => e.kind === 'expired')).toHaveLength(0);
    });

    it('lets the mob\'s death end the cover long before the ceiling', () => {
        const h = established();
        h.setNow(120000);
        h.tracker.handleObjectsNums([PLAYER_NUM, 605050, 605056]);
        h.tracker.tick(120000);
        expect(h.edges()).toHaveLength(1);

        h.tracker.handleLine('Zreczny ogromny zolnierz umarl.');
        expect(h.edges()).toHaveLength(0);
        expect(h.log.at(-1)).toMatchObject({ kind: 'expired', reason: 'death' });
    });
});

/**
 * A five-enemy team fight, from the second recording. Where the first episode had
 * one attacker and two mobs, this one has four teammates, five near-identical mob
 * descs, covers running in both directions and momentary team covers that end in
 * the same frame they start.
 *
 * Ids and lines are verbatim from the capture.
 */
describe('coverTracker - team fight replay', () => {
    const KHORN = 707885;
    const MUZIKUHR = 677162;
    const GRUNG = 672318;
    const VESPER = 690555;
    const PABLO = 692135;
    const BARCZYSTY = 265074;
    const ZGARBIONY = 265081;
    const GROZNY = 265088;
    const PONURY = 265095;
    const WYSOKI = 654287;

    const ALL = [KHORN, MUZIKUHR, GRUNG, VESPER, PABLO, BARCZYSTY, ZGARBIONY, GROZNY, PONURY, WYSOKI];

    function fight(): Harness {
        const h = harness([
            { num: KHORN, desc: 'Khorn', __category: 'player' },
            { num: MUZIKUHR, desc: 'Muzikuhr', __category: 'team' },
            { num: GRUNG, desc: 'Grung', __category: 'team' },
            { num: VESPER, desc: 'Vesper', __category: 'team' },
            { num: PABLO, desc: 'Pablo', __category: 'team' },
            { num: BARCZYSTY, desc: 'barczysty butny mezczyzna', __category: 'rest' },
            { num: ZGARBIONY, desc: 'zgarbiony ponury mezczyzna', __category: 'rest' },
            { num: GROZNY, desc: 'muskularny grozny mezczyzna', __category: 'rest' },
            { num: PONURY, desc: 'muskularny ponury mezczyzna', __category: 'rest' },
            { num: WYSOKI, desc: 'wysoki niebieskooki mezczyzna', __category: 'rest' },
        ], KHORN);
        h.tracker.handleObjectsNums(ALL);
        return h;
    }

    it('fans our own three-attacker cover out and drops it all on release', () => {
        const h = fight();
        h.tracker.handleLine(
            'Zrecznie zaslaniasz Grunga przed ciosami muskularnego groznego mezczyzny, '
            + 'zgarbionego ponurego mezczyzny i muskularnego ponurego mezczyzny.');
        // Three attackers, three edges - and the two "muskularny ... mezczyzna"
        // descs differing in one adjective must land on different objects.
        expect(h.triple()).toEqual([
            `${GRUNG}:${KHORN}:${GROZNY}`,
            `${GRUNG}:${KHORN}:${PONURY}`,
            `${GRUNG}:${KHORN}:${ZGARBIONY}`,
        ].sort());

        h.tracker.handleLine('Przestajesz zaslaniac Grunga.');
        expect(h.edges()).toHaveLength(0);
    });

    it('handles a team cover that ends in the same frame it starts', () => {
        const h = fight();
        h.tracker.handleLine('Muzikuhr zrecznie zaslania Grunga przed ciosami barczystego butnego mezczyzny.');
        expect(h.triple()).toEqual([`${GRUNG}:${MUZIKUHR}:${BARCZYSTY}`]);
        h.tracker.handleLine('Muzikuhr przestaje zaslaniac Grunga.');
        expect(h.edges()).toHaveLength(0);
    });

    it('drops a retreat-behind us when the covered steps out from behind', () => {
        const h = fight();
        h.tracker.handleLine(
            'Pablo zastawia sie swoja zdobiona stalowa halabarda i szybko przesuwa sie za ciebie, '
            + 'kryjac sie przed atakami muskularnego groznego mezczyzny.');
        expect(h.triple()).toEqual([`${PABLO}:${KHORN}:${GROZNY}`]);
        h.tracker.handleLine('Pablo wychodzi zza twojej zaslony.');
        expect(h.edges()).toHaveLength(0);
        expect(h.log.at(-1)).toMatchObject({ kind: 'released' });
    });

    it('drops our retreat-behind a teammate when we step out from behind', () => {
        const h = fight();
        h.tracker.handleLine(
            'Zastawiasz sie swoja zdobiona stalowa halabarda i szybko przesuwasz sie za Pabla, '
            + 'kryjac sie przed atakami muskularnego groznego mezczyzny.');
        expect(h.triple()).toEqual([`${KHORN}:${PABLO}:${GROZNY}`]);
        h.tracker.handleLine('Wychodzisz zza zaslony Pabla.');
        expect(h.edges()).toHaveLength(0);
        expect(h.log.at(-1)).toMatchObject({ kind: 'released' });
    });

    it('reads "zaslania cie" as a cover on us, and its release', () => {
        const h = fight();
        h.tracker.handleLine('Pablo zrecznie zaslania cie przed ciosami muskularnego groznego mezczyzny.');
        expect(h.triple()).toEqual([`${KHORN}:${PABLO}:${GROZNY}`]);
        h.tracker.handleLine('Pablo przestaje cie zaslaniac przed ciosami wrogow.');
        expect(h.edges()).toHaveLength(0);
    });

    it('resolves an undeclined teammate name in the attacker list', () => {
        const h = fight();
        // "przed ciosami Vesper" - nominative, where mobs decline.
        h.tracker.handleLine(
            'Wysoki niebieskooki mezczyzna zrecznie zaslania zgarbionego ponurego mezczyzne przed ciosami Vesper.');
        expect(h.triple()).toEqual([`${ZGARBIONY}:${WYSOKI}:${VESPER}`]);
    });

    /**
     * The break frees the target for the WHOLE team, and the capture confirms it
     * outright - which is worth recording, because the sequence reads as if it
     * disproved the rule until you line it up against GMCP:
     *
     *   20398  cover on zgarbiony, named against Vesper
     *   20540  {"690555":{"attack_num":654287}}   Vesper redirected onto the coverer
     *   20768  GRUNG breaks through
     *   21505  a NEW cover on zgarbiony, this time named against Muzikuhr
     *   21718  {"677162":{"attack_num":265095}}   Muzikuhr redirected onto that coverer
     *   21879  VESPER breaks through
     *   22114  {"677162":{"attack_num":265081}}   Muzikuhr back on the real target
     *
     * Vesper is not breaking for herself at 21879 - she is breaking a cover that
     * was established against Muzikuhr, and Muzikuhr is the one it frees. Each
     * cover redirects only its named attacker; each break releases everyone.
     */
    it('lets one teammate\'s break free the target for the whole team', () => {
        const h = fight();
        h.tracker.handleLine(
            'Wysoki niebieskooki mezczyzna zrecznie zaslania zgarbionego ponurego mezczyzne przed ciosami Vesper.');
        // Grung breaks through, though the cover named Vesper.
        h.tracker.handleLine('Grung rzuca sie na zgarbionego ponurego mezczyzne przebijajac sie przez jego ochrone.');
        expect(h.edges()).toHaveLength(0);
        // The break line names no coverer; the log says who was actually cleared.
        expect(h.log.at(-1)).toMatchObject({
            kind: 'break-ok', coveredId: ZGARBIONY, covererId: WYSOKI, attackerId: GRUNG,
        });

        // The same target is covered again moments later, now against Muzikuhr.
        h.tracker.handleLine(
            'Muskularny ponury mezczyzna zrecznie zaslania zgarbionego ponurego mezczyzne przed ciosami Muzikuhr.');
        expect(h.triple()).toEqual([`${ZGARBIONY}:${PONURY}:${MUZIKUHR}`]);

        // Vesper breaks it - and it is MUZIKUHR who is freed.
        h.tracker.handleLine('Vesper rzuca sie na zgarbionego ponurego mezczyzne przebijajac sie przez jego ochrone.');
        expect(h.edges()).toHaveLength(0);
        expect(h.tracker.isCoveredFor(ZGARBIONY, MUZIKUHR)).toBe(false);
        expect(h.log.at(-1)).toMatchObject({
            kind: 'break-ok', coveredId: ZGARBIONY, covererId: PONURY, attackerId: VESPER,
        });
    });

    it('drops a mob\'s cover when the mob it was protecting dies', () => {
        const h = fight();
        h.tracker.handleLine(
            'Muskularny grozny mezczyzna zrecznie zaslania zgarbionego ponurego mezczyzne przed ciosami Pabla.');
        h.tracker.handleLine('Zgarbiony ponury mezczyzna umarl.');
        expect(h.edges()).toHaveLength(0);
        expect(h.log.at(-1)).toMatchObject({ kind: 'expired', reason: 'death' });
    });

    it('creates nothing from the seventeen failed cover attempts', () => {
        const h = fight();
        h.tracker.handleLine(
            'Pablo probuje zaslonic Grunga przed ciosami wysokiego niebieskookiego mezczyzny, '
            + 'jednak nie jest w stanie tego uczynic.');
        h.tracker.handleLine(
            'Barczysty butny mezczyzna probuje zaslonic muskularnego groznego mezczyzne przed ciosami Pabla, '
            + 'jednak nie jest w stanie tego uczynic.');
        expect(h.edges()).toHaveLength(0);
        expect(kinds(h.log)).toEqual(['failed', 'failed']);
    });

    it('recognises the block line as one it already knew about', () => {
        const h = fight();
        h.tracker.handleLine(
            'Barczysty butny mezczyzna zrecznie zaslania wysokiego niebieskookiego mezczyzne przed ciosami Grunga.');
        h.tracker.handleLine(
            'Grung rzuca sie na wysokiego niebieskookiego mezczyzne, lecz barczysty butny mezczyzna staje mu na drodze.');
        expect(h.triple()).toEqual([`${WYSOKI}:${BARCZYSTY}:${GRUNG}`]);
        // The fight produced two of these and neither was a surprise - the
        // tracker's own miss counter read zero across the whole 95 s.
        expect(h.log.at(-1)).toMatchObject({ kind: 'blocked', wasKnown: true });
    });

    it('keeps covers on different targets apart', () => {
        const h = fight();
        h.tracker.handleLine(
            'Barczysty butny mezczyzna zrecznie zaslania wysokiego niebieskookiego mezczyzne przed ciosami Muzikuhr.');
        h.tracker.handleLine('Pablo zrecznie zaslania Vesper przed ciosami wysokiego niebieskookiego mezczyzny.');
        expect(h.triple()).toEqual([
            `${VESPER}:${PABLO}:${WYSOKI}`,
            `${WYSOKI}:${BARCZYSTY}:${MUZIKUHR}`,
        ].sort());
        // Releasing one leaves the other standing.
        h.tracker.handleLine('Pablo przestaje zaslaniac Vesper.');
        expect(h.triple()).toEqual([`${WYSOKI}:${BARCZYSTY}:${MUZIKUHR}`]);
    });
});

/**
 * Two mobs taking turns covering each other off the player, from the third
 * recording. GMCP settles the rule outright, because `attack_num` is a single
 * value and every cover moves it:
 *
 *    18582  {"707885":{"attack_num":622911}}   we are on grozny
 *    68600  "Muskularny ogromny zaslania groznego otylego przed twoimi ciosami."
 *    68756  {"707885":{"attack_num":622905}}   redirected onto muskularny
 *   120611  "Grozny otyly zaslania muskularnego ogromnego przed twoimi ciosami."
 *   120844  {"707885":{"attack_num":622911}}   redirected onto grozny
 *
 * We cannot be blocked by both at once - one body is in the way, and it is the
 * newest one. So a fresh cover naming the same attacker retires the previous one.
 */
describe('coverTracker - one cover per attacker', () => {
    const ME = 707885;
    const MUSKULARNY = 622905;
    const GROZNY = 622911;

    function pair(): Harness {
        const h = harness([
            { num: ME, desc: 'Khorn', __category: 'player' },
            { num: MUSKULARNY, desc: 'muskularny ogromny zolnierz', __category: 'rest' },
            { num: GROZNY, desc: 'grozny otyly zolnierz', __category: 'rest' },
        ], ME);
        h.tracker.handleObjectsNums([ME, MUSKULARNY, GROZNY]);
        return h;
    }

    const COVERS_GROZNY =
        'Muskularny ogromny zolnierz zrecznie zaslania groznego otylego zolnierza przed twoimi ciosami.';
    const COVERS_MUSKULARNY =
        'Grozny otyly zolnierz zrecznie zaslania muskularnego ogromnego zolnierza przed twoimi ciosami.';

    it('retires the previous cover when the roles reverse', () => {
        const h = pair();
        h.tracker.handleLine(COVERS_GROZNY);
        expect(h.triple()).toEqual([`${GROZNY}:${MUSKULARNY}:${ME}`]);

        h.tracker.handleLine(COVERS_MUSKULARNY);
        // Exactly one, not two: the first has stopped applying to us.
        expect(h.triple()).toEqual([`${MUSKULARNY}:${GROZNY}:${ME}`]);
        // Two rules would each retire it here; the positional one fires first and
        // is the stronger claim, because it holds for every attacker at once.
        expect(h.log.map(e => `${e.kind}${e.reason ? '/' + e.reason : ''}`)).toEqual([
            'established', 'expired/now-covering', 'established',
        ]);
    });

    it('keeps exactly one edge through a whole exchange of covers', () => {
        const h = pair();
        for (const line of [COVERS_GROZNY, COVERS_MUSKULARNY, COVERS_GROZNY, COVERS_MUSKULARNY]) {
            h.tracker.handleLine(line);
            expect(h.edges()).toHaveLength(1);
        }
        expect(h.log.filter(e => e.reason === 'ttl')).toHaveLength(0);
        h.tracker.handleLine('Grozny otyly zolnierz umarl.');
        expect(h.edges()).toHaveLength(0);
        expect(h.log.at(-1)).toMatchObject({ kind: 'expired', reason: 'death' });
    });

    it('supersedes per attacker, leaving other attackers\' covers alone', () => {
        const h = harness([
            { num: ME, desc: 'Khorn', __category: 'player' },
            { num: 1001, desc: 'Vesper', __category: 'team' },
            { num: MUSKULARNY, desc: 'muskularny ogromny zolnierz', __category: 'rest' },
            { num: GROZNY, desc: 'grozny otyly zolnierz', __category: 'rest' },
        ], ME);
        h.tracker.handleObjectsNums([ME, 1001, MUSKULARNY, GROZNY]);
        h.tracker.handleLine(
            'Muskularny ogromny zolnierz zrecznie zaslania groznego otylego zolnierza przed ciosami Vesper.');
        h.tracker.handleLine(COVERS_GROZNY);
        // Ours replaces nothing of Vesper's - she is blocked independently.
        expect(h.triple()).toEqual([
            `${GROZNY}:${MUSKULARNY}:1001`,
            `${GROZNY}:${MUSKULARNY}:${ME}`,
        ].sort());
    });

    it('does not starve between GMCP packets when nothing is changing', () => {
        const h = pair();
        h.setNow(0);
        h.tracker.handleLine(COVERS_GROZNY);
        h.tracker.handleObjectsData({ [ME]: { attack_num: MUSKULARNY } });

        // GMCP only speaks when something changes: the capture went 12 593 ms
        // between two hp ticks, and a short decay ended the cover in that gap.
        for (let t = 1000; t <= 30000; t += 1000) {
            h.setNow(t);
            h.tracker.tick(t);
        }
        expect(h.edges()).toHaveLength(1);
        expect(kinds(h.log)).not.toContain('expired');
    });
});

/**
 * The real cover episode from `arkadia-recording-zaslony.json`, replayed in order
 * with the recording's own timestamps. Steps keep their original t (ms) so the
 * death / break grace windows are exercised at the spacing the game produced.
 */
describe('coverTracker - recording replay', () => {
    type Step =
        | { t: number; text: string; edges: string[] }
        | { t: number; nums: number[]; edges: string[] }
        | { t: number; data: Record<number, { attack_num?: number }>; edges: string[] };

    const EDGE = `605056:605050:${PLAYER_NUM}`;

    const STEPS: Step[] = [
        { t: 911, nums: [PLAYER_NUM, 605056, 605050], edges: [] },
        // Both mobs engage: first sighting of attack_num, so nothing to compare against.
        { t: 2309, data: { 605050: { attack_num: PLAYER_NUM }, 605056: { attack_num: PLAYER_NUM }, [PLAYER_NUM]: { attack_num: 605056 } }, edges: [] },
        { t: 73291, text: 'Grozny porywczy zolnierz zrecznie zaslania zrecznego ogromnego zolnierza przed twoimi ciosami.', edges: [EDGE] },
        // GMCP corroborates the cover we already hold - refresh, not a second edge.
        { t: 73483, data: { [PLAYER_NUM]: { attack_num: 605050 } }, edges: [EDGE] },
        { t: 81092, text: 'Rzucasz sie na zrecznego ogromnego zolnierza, lecz grozny porywczy zolnierz staje ci na drodze.', edges: [EDGE] },
        { t: 84312, text: 'Bezskutecznie rzucasz sie na zrecznego ogromnego zolnierza, probujac przebic sie przez jego ochrone.', edges: [EDGE] },
        { t: 84323, text: 'Rzucasz sie na zrecznego ogromnego zolnierza, lecz grozny porywczy zolnierz staje ci na drodze.', edges: [EDGE] },
        { t: 95308, text: 'Rzucasz sie na zrecznego ogromnego zolnierza przebijajac sie przez jego ochrone.', edges: [] },
        { t: 95321, text: 'Juz walczysz z zrecznym ogromnym zolnierzem.', edges: [] },
        // The flip back onto the freed target is the break, not a new cover.
        { t: 95511, data: { [PLAYER_NUM]: { attack_num: 605056 } }, edges: [] },
        { t: 98131, text: 'Zreczny ogromny zolnierz umarl.', edges: [] },
        { t: 98363, nums: [PLAYER_NUM, 605050], edges: [] },
        // Same flip shape as the cover at 73483 - but this one is the death.
        { t: 98363, data: { [PLAYER_NUM]: { attack_num: 605050 } }, edges: [] },
    ];

    it('holds exactly one edge through the cover and nothing after the break', () => {
        const h = harness(RECORDING_OBJECTS);
        for (const step of STEPS) {
            h.setNow(step.t);
            if ('text' in step) expect(h.tracker.handleLine(step.text)).toBe(true);
            else if ('nums' in step) h.tracker.handleObjectsNums(step.nums);
            else h.tracker.handleObjectsData(step.data);
            // Nothing in this episode goes 12 s without corroboration.
            h.tracker.tick(step.t);
            expect(h.triple()).toEqual(step.edges);
        }
        // The block line fired three times for a cover we had already seen, so the
        // tracker's own miss counter has to read zero.
        const unknownBlocks = h.log.filter(e => e.kind === 'blocked' && e.wasKnown === false);
        expect(unknownBlocks).toHaveLength(0);
        expect(h.log.filter(e => e.kind === 'blocked')).toHaveLength(2);
        expect(h.log.filter(e => e.kind === 'gmcp-suspect')).toHaveLength(0);
    });
});

/**
 * Cover is positional, and the two roles are exclusive: stepping in front of
 * somebody means stepping out from behind everybody. So the moment a party starts
 * covering, every cover held over THEM ends - whoever the coverer was and whoever
 * it was blocking. The game says nothing when this happens, which is exactly why
 * it has to be inferred: the freed attackers simply start landing on the new
 * coverer again, with no break line and no release line in between.
 */
describe('coverTracker - becoming a coverer ends being covered', () => {
    const ME = 707885;
    const VESPER = 690555;
    const MEZCZYZNA = 473506;
    const ZOLNIERZ = 473494;
    const GROZNY = 473500;

    const ALL = [ME, VESPER, MEZCZYZNA, ZOLNIERZ, GROZNY];

    function fight(): Harness {
        const h = harness([
            { num: ME, desc: 'Khorn', __category: 'player' },
            { num: VESPER, desc: 'Vesper', __category: 'team' },
            { num: MEZCZYZNA, desc: 'muskularny wysoki mezczyzna', __category: 'rest' },
            { num: ZOLNIERZ, desc: 'cuchnacy otyly zolnierz', __category: 'rest' },
            { num: GROZNY, desc: 'grozny odwazny zolnierz', __category: 'rest' },
        ], ME);
        h.tracker.handleObjectsNums(ALL);
        return h;
    }

    const COVERS_US_VS_MEZCZYZNA =
        'Vesper zrecznie zaslania cie przed ciosami muskularnego wysokiego mezczyzny.';
    const COVERS_US_VS_ZOLNIERZ =
        'Vesper zrecznie zaslania cie przed ciosami cuchnacego otylego zolnierza.';
    const WE_COVER_HER =
        'Zrecznie zaslaniasz Vesper przed ciosami cuchnacego otylego zolnierza.';

    it('drops every cover held over us, not just the one against the same attacker', () => {
        const h = fight();
        h.tracker.handleLine(COVERS_US_VS_MEZCZYZNA);
        h.tracker.handleLine(COVERS_US_VS_ZOLNIERZ);
        expect(h.triple()).toEqual([
            `${ME}:${VESPER}:${MEZCZYZNA}`,
            `${ME}:${VESPER}:${ZOLNIERZ}`,
        ].sort());

        h.tracker.handleLine(WE_COVER_HER);
        // Both of hers are gone - including the one naming an attacker ours never
        // mentions, which is what separates this from the per-attacker rule.
        expect(h.triple()).toEqual([`${VESPER}:${ME}:${ZOLNIERZ}`]);
        expect(h.tracker.isCoveredFor(ME, MEZCZYZNA)).toBe(false);
        expect(h.tracker.getCoveredForAttacker(MEZCZYZNA)).toEqual([]);
        expect(h.log.filter(e => e.kind === 'expired')).toEqual([
            expect.objectContaining({
                reason: 'now-covering', coveredId: ME, covererId: VESPER, attackerId: MEZCZYZNA,
            }),
            expect.objectContaining({
                reason: 'now-covering', coveredId: ME, covererId: VESPER, attackerId: ZOLNIERZ,
            }),
        ]);
    });

    it('fires wherever we step, not only in front of our own coverer', () => {
        const h = fight();
        h.tracker.handleLine(COVERS_US_VS_MEZCZYZNA);
        // A third party entirely - and Vesper's cover on us still ends, because what
        // undoes it is us being in front of somebody, not who that somebody is.
        h.tracker.handleLine(
            'Zrecznie zaslaniasz groznego odwaznego zolnierza przed ciosami cuchnacego otylego zolnierza.');
        expect(h.triple()).toEqual([`${GROZNY}:${ME}:${ZOLNIERZ}`]);
    });

    it('leaves covers we are no part of standing', () => {
        const h = fight();
        h.tracker.handleLine(COVERS_US_VS_MEZCZYZNA);
        h.tracker.handleLine(
            'Cuchnacy otyly zolnierz zrecznie zaslania groznego odwaznego zolnierza przed ciosami Vesper.');
        // Only what was held over US goes; the mobs' own cover is untouched.
        h.tracker.handleLine(WE_COVER_HER);
        expect(h.triple()).toEqual([
            `${GROZNY}:${ZOLNIERZ}:${VESPER}`,
            `${VESPER}:${ME}:${ZOLNIERZ}`,
        ].sort());
    });

    it('does not fire when somebody else starts covering', () => {
        const h = fight();
        h.tracker.handleLine(COVERS_US_VS_MEZCZYZNA);
        // The zolnierz steps forward, so his own protection would go - ours does not.
        h.tracker.handleLine(
            'Cuchnacy otyly zolnierz zrecznie zaslania groznego odwaznego zolnierza przed ciosami Vesper.');
        expect(h.triple()).toEqual([
            `${GROZNY}:${ZOLNIERZ}:${VESPER}`,
            `${ME}:${VESPER}:${MEZCZYZNA}`,
        ].sort());
    });

    it('applies to a cover we only learn about from a block line', () => {
        const h = fight();
        h.tracker.handleLine(COVERS_US_VS_MEZCZYZNA);
        // Never announced, so the block is the first we hear of us covering Vesper.
        h.tracker.handleLine(
            'Cuchnacy otyly zolnierz rzuca sie na Vesper, lecz Khorn staje mu na drodze.');
        expect(h.triple()).toEqual([`${VESPER}:${ME}:${ZOLNIERZ}`]);
    });

    /**
     * The whole episode at its own timestamps, so the GMCP flips land at the same
     * spacing as the grace windows. Both of Vesper's covers end with no line of
     * their own: the attackers just come back at us, the near one within the same
     * second and the far one on its next retarget ten seconds later.
     */
    it('replays the episode without minting a phantom cover from the flips back', () => {
        type Step =
            | { t: number; text: string; edges: string[] }
            | { t: number; nums: number[]; edges: string[] }
            | { t: number; data: Record<number, { attack_num?: number }>; edges: string[] };

        const VS_MEZCZYZNA = `${ME}:${VESPER}:${MEZCZYZNA}`;
        const VS_ZOLNIERZ = `${ME}:${VESPER}:${ZOLNIERZ}`;
        const BOTH = [VS_MEZCZYZNA, VS_ZOLNIERZ].sort();

        const STEPS: Step[] = [
            { t: 77568, nums: ALL, edges: [] },
            // Everyone engages - first sighting, so there is nothing to compare against.
            {
                t: 79223,
                data: {
                    [ZOLNIERZ]: { attack_num: ME },
                    [GROZNY]: { attack_num: VESPER },
                    [MEZCZYZNA]: { attack_num: ME },
                    [VESPER]: { attack_num: GROZNY },
                    [ME]: { attack_num: ZOLNIERZ },
                },
                edges: [],
            },
            {
                t: 80602,
                text: 'Vesper probuje zaslonic cie przed ciosami muskularnego wysokiego mezczyzny, '
                    + 'jednak nie jest w stanie tego uczynic.',
                edges: [],
            },
            { t: 80602, data: { [ME]: { attack_num: GROZNY } }, edges: [] },
            { t: 85461, text: COVERS_US_VS_MEZCZYZNA, edges: [VS_MEZCZYZNA] },
            // GMCP corroborates the cover we already hold.
            { t: 85585, data: { [MEZCZYZNA]: { attack_num: VESPER } }, edges: [VS_MEZCZYZNA] },
            { t: 95230, text: COVERS_US_VS_ZOLNIERZ, edges: BOTH },
            { t: 95407, data: { [ZOLNIERZ]: { attack_num: VESPER } }, edges: BOTH },
            { t: 101604, data: { [VESPER]: { attack_num: ZOLNIERZ } }, edges: BOTH },
            { t: 104236, text: 'Zabiles groznego odwaznego zolnierza.', edges: BOTH },
            { t: 104473, nums: [VESPER, ME, MEZCZYZNA, ZOLNIERZ], edges: BOTH },
            { t: 104473, data: { [ME]: { attack_num: ZOLNIERZ } }, edges: BOTH },
            {
                t: 105815,
                text: 'Probujesz zaslonic Vesper przed ciosami cuchnacego otylego zolnierza, '
                    + 'jednak nie jestes w stanie tego uczynic.',
                edges: BOTH,
            },
            // We get in front of her - and both of her covers end right here.
            { t: 111872, text: WE_COVER_HER, edges: [`${VESPER}:${ME}:${ZOLNIERZ}`] },
            { t: 111876, text: 'Przestajesz zaslaniac Vesper.', edges: [] },
            // The near attacker is back on us 120 ms later. That flip is the release,
            // not somebody covering us, and must not be read as a suspected cover.
            { t: 111992, data: { [ZOLNIERZ]: { attack_num: ME } }, edges: [] },
            { t: 121802, data: { [MEZCZYZNA]: { attack_num: ME } }, edges: [] },
        ];

        const h = fight();
        for (const step of STEPS) {
            h.setNow(step.t);
            if ('text' in step) expect(h.tracker.handleLine(step.text)).toBe(true);
            else if ('nums' in step) h.tracker.handleObjectsNums(step.nums);
            else h.tracker.handleObjectsData(step.data);
            h.tracker.tick(step.t);
            expect(h.triple()).toEqual(step.edges);
        }
        // Nothing here is a break, so the tracker must never claim one.
        expect(kinds(h.log)).not.toContain('break-ok');
    });
});
