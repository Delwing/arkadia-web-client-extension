import { fuzzyMatchScore, wordListMatchScore } from "@client/utils/fuzzyMatch";
import { parseNames } from "@client/utils/parseNames";

/**
 * Cover ("zaslona") line grammar plus the name resolver both the tracker and its
 * tests drive directly.
 *
 * Phrasings come from `src/client/scripts/gags_lua.json`
 * (`color_zaslony_udane`, `color_zaslony_nieudane`, `color_other`,
 * `color_rozkazy`) - that dump is the authoritative list, far wider than any one
 * recording. The block line ("... staje ci na drodze.") and the three release
 * lines were missing from it entirely and are authored here.
 *
 * Every pattern is ASCII-only: game text reaches the trigger engine ASCII-folded.
 */

/** Stands for the player wherever a line names them with a pronoun or a verb form. */
export const PLAYER = "@ty";

/** Second-person pronouns that always mean the player - never fuzzy-matched. */
const PLAYER_WORDS = new Set([PLAYER, "ty", "cie", "ciebie", "tobie", "toba"]);

export type CoverSource = 'cover-line' | 'block-line' | 'break-fail' | 'retreat' | 'gmcp';

export type CoverLineKind =
    /** A cover was set up - create one edge per named attacker. */
    | 'established'
    /** A cover (or a retreat) was attempted and missed - log it, create nothing. */
    | 'failed'
    /** An attack ran into a cover - creates the edge when we did not have it. */
    | 'blocked'
    /** "przelam obrone" missed - refreshes the covered target's edges. */
    | 'break-failed'
    /** "przelam obrone" landed - clears every edge for the covered target. */
    | 'break-ok'
    /** The coverer stopped covering - clears that (covered, coverer) pair. */
    | 'released'
    /** Retreat-behind: same relation, different mechanic. */
    | 'retreat'
    /** Somebody died - drops every edge they were part of. */
    | 'death'
    /** Recognised, but it carries no usable attacker - logged, never an edge. */
    | 'ambiguous';

export interface CoverLineMatch {
    kind: CoverLineKind;
    source: CoverSource;
    /** Who is protected. */
    covered?: string;
    /** Who does the protecting. */
    coverer?: string;
    /** Who the cover blocks. One edge per entry - cover is always per-attacker. */
    attackers?: string[];
    /**
     * `coverer` still carries the "Na rozkaz <orderer> " prefix, which cannot be
     * split off by grammar. Resolve it by trying successive suffixes.
     */
    covererHasOrderPrefix?: boolean;
    /** The dead party, for `kind: 'death'`. */
    who?: string;
    /** Only the player's edges for `covered` are cleared ("Juz walczysz z ..."). */
    playerOnly?: boolean;
}

interface CoverRule {
    re: RegExp;
    build: (groups: Record<string, string | undefined>) => CoverLineMatch | null;
}

const attackerList = (raw?: string): string[] => (raw ? parseNames(raw) : []);

/**
 * Ordered - the first rule that matches wins. Order is load-bearing in two
 * places: "Na rozkaz ..." must be tried before the bare "zaslania" forms, and
 * the player-voice retreat lines before their third-person siblings.
 */
const RULES: CoverRule[] = [
    // --- deaths (2.3.4) -----------------------------------------------------
    {
        re: /^(?<who>.+?) (?:umarl|umarla|umiera|kona)\.$/,
        build: g => ({ kind: 'death', source: 'cover-line', who: g.who }),
    },
    {
        re: /^Zabil[ae]s (?<who>.+?)\.$/,
        build: g => ({ kind: 'death', source: 'cover-line', who: g.who }),
    },

    // --- 3.3 attacks against a cover ---------------------------------------
    {
        re: /^Rzucasz sie na (?<covered>.+?) przebijajac sie przez .+? ochrone\.$/,
        build: g => ({ kind: 'break-ok', source: 'block-line', covered: g.covered, attackers: [PLAYER] }),
    },
    {
        re: /^(?<attacker>.+?) rzuca sie na (?<covered>.+?) przebijajac sie przez .+? ochrone\.$/,
        build: g => ({ kind: 'break-ok', source: 'block-line', covered: g.covered, attackers: [g.attacker!] }),
    },
    {
        re: /^Bezskutecznie rzucasz sie na (?<covered>.+?), probujac przebic sie przez .+? ochrone\.$/,
        build: g => ({ kind: 'break-failed', source: 'break-fail', covered: g.covered, attackers: [PLAYER] }),
    },
    {
        re: /^(?<attacker>.+?) rzuca sie na (?<covered>.+?), bezskutecznie probujac przebic sie przez .+? ochrone\.$/,
        build: g => ({ kind: 'break-failed', source: 'break-fail', covered: g.covered, attackers: [g.attacker!] }),
    },
    {
        // The single best signal in the protocol: names both parties and re-fires
        // on every poke, so it re-confirms the pairing on demand.
        re: /^Rzucasz sie na (?<covered>.+?), lecz (?<coverer>.+?) staje ci na drodze\.$/,
        build: g => ({ kind: 'blocked', source: 'block-line', covered: g.covered, coverer: g.coverer, attackers: [PLAYER] }),
    },
    {
        // "staje jej na drodze" genders the ATTACKER, not the coverer - parsed and dropped.
        re: /^(?<attacker>.+?) rzuca sie na (?<covered>.+?), lecz (?<coverer>.+?) staje (?:mu|jej) na drodze\.$/,
        build: g => ({ kind: 'blocked', source: 'block-line', covered: g.covered, coverer: g.coverer, attackers: [g.attacker!] }),
    },
    {
        // Corroborates a break that already landed - only ever the player's own edges.
        re: /^Juz walczysz z (?<covered>.+?)\.$/,
        build: g => ({ kind: 'break-ok', source: 'block-line', covered: g.covered, attackers: [PLAYER], playerOnly: true }),
    },

    // --- 3.4 cover released -------------------------------------------------
    {
        re: /^Przestajesz zaslaniac (?<covered>.+?)\.$/,
        build: g => ({ kind: 'released', source: 'cover-line', covered: g.covered, coverer: PLAYER }),
    },
    {
        re: /^(?<coverer>.+?) przestaje cie zaslaniac przed ciosami wrogow\.$/,
        build: g => ({ kind: 'released', source: 'cover-line', covered: PLAYER, coverer: g.coverer }),
    },
    {
        re: /^(?<coverer>.+?) przestaje zaslaniac (?<covered>.+?)\.$/,
        build: g => ({ kind: 'released', source: 'cover-line', covered: g.covered, coverer: g.coverer }),
    },
    // The covered side ending it - typically after a retreat-behind.
    {
        re: /^(?<covered>.+?) wychodzi zza twojej zaslony\.$/,
        build: g => ({ kind: 'released', source: 'retreat', covered: g.covered, coverer: PLAYER }),
    },
    {
        re: /^Wychodzisz zza zaslony (?<coverer>.+?)\.$/,
        build: g => ({ kind: 'released', source: 'retreat', covered: PLAYER, coverer: g.coverer }),
    },

    // --- 3.2 failed covers - matched only so they are never half-matched ----
    {
        re: /^Na rozkaz .+? probujesz zaslonic (?<covered>.+?) przed ciosami (?<attackers>.+?), jednak nie jestes w stanie tego uczynic\.$/,
        build: g => ({ kind: 'failed', source: 'cover-line', covered: g.covered, coverer: PLAYER, attackers: attackerList(g.attackers) }),
    },
    {
        re: /^Probujesz zaslonic (?<covered>.+?) przed ciosami (?<attackers>.+?), jednak nie jestes w stanie tego uczynic\.$/,
        build: g => ({ kind: 'failed', source: 'cover-line', covered: g.covered, coverer: PLAYER, attackers: attackerList(g.attackers) }),
    },
    {
        re: /^(?<coverer>.+?) probuje zaslonic (?<covered>.+?) przed ciosami (?<attackers>.+?), jednak nie jest w stanie tego uczynic\.$/,
        build: g => ({ kind: 'failed', source: 'cover-line', covered: g.covered, coverer: g.coverer, attackers: attackerList(g.attackers) }),
    },
    {
        re: /^(?<coverer>.+?) probuje zaslonic (?<covered>.+?) przed twoimi ciosami, jednak nie jest w stanie tego uczynic\.$/,
        build: g => ({ kind: 'failed', source: 'cover-line', covered: g.covered, coverer: g.coverer, attackers: [PLAYER] }),
    },

    // --- 3.2 cover established ---------------------------------------------
    {
        re: /^Na rozkaz .+? zaslaniasz (?<covered>.+?) przed ciosami (?<attackers>.+?)\.$/,
        build: g => ({ kind: 'established', source: 'cover-line', covered: g.covered, coverer: PLAYER, attackers: attackerList(g.attackers) }),
    },
    {
        // "Na rozkaz <orderer> <coverer> zaslania ..." - grammar cannot tell the two
        // apart, so the resolver retries on successive suffixes of the capture.
        re: /^Na rozkaz (?<coverer>.+?) zaslania (?<covered>.+?) przed ciosami (?<attackers>.+?)\.$/,
        build: g => ({
            kind: 'established',
            source: 'cover-line',
            covered: g.covered,
            coverer: g.coverer,
            covererHasOrderPrefix: true,
            attackers: attackerList(g.attackers),
        }),
    },
    {
        re: /^Zrecznie zaslaniasz (?<covered>.+?) przed ciosami (?<attackers>.+?)\.$/,
        build: g => ({ kind: 'established', source: 'cover-line', covered: g.covered, coverer: PLAYER, attackers: attackerList(g.attackers) }),
    },
    {
        re: /^(?<coverer>.+?)(?: zrecznie)? zaslania (?<covered>.+?) przed twoimi ciosami\.$/,
        build: g => ({ kind: 'established', source: 'cover-line', covered: g.covered, coverer: g.coverer, attackers: [PLAYER] }),
    },
    {
        re: /^(?<coverer>.+?)(?: zrecznie)? zaslania (?<covered>.+?) przed ciosami (?<attackers>.+?)\.$/,
        build: g => ({ kind: 'established', source: 'cover-line', covered: g.covered, coverer: g.coverer, attackers: attackerList(g.attackers) }),
    },
    {
        // "staje pomiedzy A a B" - A is protected, B is the attacker it blocks.
        re: /^Z wprawa stajesz pomiedzy (?<covered>.+?) a (?<attacker>.+?), przyjmujac na siebie nadchodzace ciosy\.$/,
        build: g => ({ kind: 'established', source: 'cover-line', covered: g.covered, coverer: PLAYER, attackers: [g.attacker!] }),
    },
    {
        re: /^(?<coverer>.+?) z wprawa staje pomiedzy (?<covered>.+?) a (?<attacker>.+?), przyjmujac na siebie nadchodzace ciosy\.$/,
        build: g => ({ kind: 'established', source: 'cover-line', covered: g.covered, coverer: g.coverer, attackers: [g.attacker!] }),
    },

    // --- 3.2 cover flavour that names no attacker (2.1: never a wildcard edge) --
    {
        re: /^Stajesz u boku (?<covered>.+?), gotow w kazdej chwili zaslonic .+? przed nadchodzacym niebezpieczenstwem\.$/,
        build: g => ({ kind: 'ambiguous', source: 'cover-line', covered: g.covered, coverer: PLAYER }),
    },
    {
        re: /^(?<coverer>.+?) staje u .*?boku, gotow w kazdej chwili zaslonic (?<covered>.+?) przed nadchodzacym niebezpieczenstwem\.$/,
        build: g => ({ kind: 'ambiguous', source: 'cover-line', covered: g.covered, coverer: g.coverer }),
    },
    {
        re: /^Zdecydowanym krokiem wysuwasz sie przed (?<covered>.+?), zimnym spojrzeniem .+\.$/,
        build: g => ({ kind: 'ambiguous', source: 'cover-line', covered: g.covered, coverer: PLAYER }),
    },
    {
        re: /^(?<coverer>.+?) z mrozacym krew w zylach spojrzeniem zdecydowanym krokiem wysuwa sie przed (?<covered>.+?) i .+\.$/,
        build: g => ({ kind: 'ambiguous', source: 'cover-line', covered: g.covered, coverer: g.coverer }),
    },

    // --- 3.5 failed retreats ------------------------------------------------
    {
        re: /^(?:(?:Unosisz swoja|Zastawiasz sie swo(?:ja|im)) .+? i przesuwasz|Przesuwasz) sie w strone .+?, bezskutecznie probujac .+$/,
        build: () => ({ kind: 'failed', source: 'retreat', covered: PLAYER }),
    },
    {
        re: /^(?<covered>.+?) (?:unosi swoja .+? i )?szybko przesuwa sie w (?:twoja strone|strone .+?), bezskutecznie probujac skryc sie za (?:nia|nim|toba) przed atakami .+\.$/,
        build: g => ({ kind: 'failed', source: 'retreat', covered: g.covered }),
    },
    {
        re: /^(?<covered>.+?) (?:unosi swoja .+? i )?szybko przesuwa sie w (?:twoja strone|strone .+?), bezskutecznie probujac uciec przed .+? ciosami\.$/,
        build: g => ({ kind: 'failed', source: 'retreat', covered: g.covered }),
    },

    // --- 3.5 retreat-behind - a second route to the same relation ------------
    {
        re: /^(?:Unosisz swoja|Zastawiasz sie swo(?:ja|im)) .+? i (?:szybko )?przesuwasz sie za (?<coverer>.+?), kryjac sie przed atakami (?<attackers>.+?)\.$/,
        build: g => ({ kind: 'retreat', source: 'retreat', covered: PLAYER, coverer: g.coverer, attackers: attackerList(g.attackers) }),
    },
    {
        re: /^Sprytnie manewrujac kryjesz sie za plecami (?<coverer>.+?) przed atakami (?<attackers>.+?)\.$/,
        build: g => ({ kind: 'retreat', source: 'retreat', covered: PLAYER, coverer: g.coverer, attackers: attackerList(g.attackers) }),
    },
    {
        re: /^(?<covered>.+?) (?:(?:unosi|zastawia sie) swo(?:ja|im) .+? i )?szybko przesuwa sie za (?<coverer>.+?), kryjac sie przed atakami (?<attackers>.+?)\.$/,
        build: g => ({ kind: 'retreat', source: 'retreat', covered: g.covered, coverer: g.coverer, attackers: attackerList(g.attackers) }),
    },
    {
        re: /^(?<covered>.+?) (?:(?:unosi|zastawia sie) swo(?:ja|im) .+? i )?szybko przesuwa sie za (?<coverer>.+?), uciekajac przed twoimi ciosami\.$/,
        build: g => ({ kind: 'retreat', source: 'retreat', covered: g.covered, coverer: g.coverer, attackers: [PLAYER] }),
    },
    {
        re: /^Sprytnie manewrujac (?<covered>.+?) kryje sie za twoimi plecami przed atakami (?<attackers>.+?)\.$/,
        build: g => ({ kind: 'retreat', source: 'retreat', covered: g.covered, coverer: PLAYER, attackers: attackerList(g.attackers) }),
    },
    {
        re: /^Sprytnie manewrujac (?<covered>.+?) kryje sie za plecami (?<coverer>.+?) przed atakami (?<attackers>.+?)\.$/,
        build: g => ({ kind: 'retreat', source: 'retreat', covered: g.covered, coverer: g.coverer, attackers: attackerList(g.attackers) }),
    },
];

/**
 * Cheap gate so the rule table only runs on lines that could possibly be about
 * a cover - it is evaluated on every line the game sends.
 */
export const COVER_PREFILTER =
    /zaslan|zaslon|na drodze|ochrone|przesuwa|przesuwasz|manewrujac|pomiedzy|walczysz z|wysuwa sie|wysuwasz sie|umarl|umarla|umiera|kona\.|Zabil/;

/** Strips the prompt the game prefixes lines with ("> > Rzucasz sie ..."). */
function stripPrompt(line: string): string {
    return line.replace(/^[ >]+/, '');
}

/** The one entry point: parses a game line into a cover state change, or null. */
export function matchCoverLine(rawLine: string): CoverLineMatch | null {
    const line = stripPrompt(rawLine).trim();
    if (!COVER_PREFILTER.test(line)) return null;
    for (const rule of RULES) {
        const m = line.match(rule.re);
        if (m) {
            const built = rule.build(m.groups ?? {});
            if (built) return built;
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// 4. Name resolution
// ---------------------------------------------------------------------------

export interface LocationObject {
    num: number;
    desc?: string;
    __category?: 'player' | 'team' | 'rest' | 'rest-noncombat' | string;
}

export interface ResolveOptions {
    playerNum?: number;
    /**
     * The name may carry leading words that belong to a different party
     * ("Na rozkaz <orderer> <coverer>"). Retry on successive suffixes until one
     * resolves cleanly.
     */
    trimLeadingWords?: boolean;
}

export interface ResolvedObject {
    id?: number;
    ambiguous: boolean;
    /** Ambiguous only - every object the name fits equally well, `id` first. */
    candidates?: number[];
}

/** Multi-word mob descs average several words, so they can afford a higher floor. */
const MIN_SCORE_MULTI = 0.6;
/**
 * Single-token player names decline harder with no sibling words to average
 * against ("Pabel" -> "Pabla" scores ~0.6 on a 5-char word), so they get a lower one.
 */
const MIN_SCORE_SINGLE = 0.5;
/** Two candidates this close are a tie until a discriminating word breaks it. */
const TIE_EPSILON = 0.02;

const words = (s: string): string[] => s.toLowerCase().split(/\s+/).filter(Boolean);

function normalize(name: string): string {
    return name.trim().replace(/^\[|]$/g, '').trim();
}

interface Scored {
    obj: LocationObject;
    score: number;
}

/**
 * Near-identical descs ("powazny ciemnowlosy krasnolud chaosu" vs "ponury ...")
 * score alike because `wordListMatchScore` averages over the words they share.
 * Re-score the tied candidates on the words that actually differ between them.
 */
function discriminate(tied: Scored[], query: string): ResolvedObject {
    const queryWords = words(query);
    const wordSets = tied.map(c => words(c.obj.desc ?? ''));
    const shared = wordSets.reduce<Set<string>>(
        (acc, ws) => new Set(ws.filter(w => acc.has(w))),
        new Set(wordSets[0] ?? []),
    );

    const scored = tied.map((candidate, i) => {
        const distinct = wordSets[i].filter(w => !shared.has(w));
        if (distinct.length === 0 || queryWords.length === 0) {
            return { candidate, score: 0, prefix: 0 };
        }
        const total = distinct.reduce(
            (sum, w) => sum + Math.max(...queryWords.map(q => fuzzyMatchScore(w, q))),
            0,
        );
        return {
            candidate,
            score: total / distinct.length,
            prefix: Math.max(...distinct.flatMap(w => queryWords.map(q => prefixScore(w, q)))),
        };
    });

    // Distinct-word score first, then the shared prefix: Polish declension rewrites
    // the ending, never the stem, so "Pabla" belongs to "Pabel" and not to "Abra"
    // even though both sit at the same edit distance.
    scored.sort((a, b) => b.score - a.score || b.prefix - a.prefix);
    const [best, runnerUp] = scored;
    if (best && (!runnerUp
        || best.score - runnerUp.score > TIE_EPSILON
        || best.prefix - runnerUp.prefix > TIE_EPSILON)) {
        return { id: best.candidate.obj.num, ambiguous: false };
    }
    // Still tied - text cannot tell them apart. Hand back every candidate still in
    // the running so the tracker can break the tie on GMCP `attack_num`.
    const candidates = scored
        .filter(s => best.score - s.score <= TIE_EPSILON && best.prefix - s.prefix <= TIE_EPSILON)
        .map(s => s.candidate.obj.num);
    return { id: candidates[0], ambiguous: true, candidates };
}

/** How much of a shared stem two words have, normalised by the longer one. */
function prefixScore(a: string, b: string): number {
    const max = Math.max(a.length, b.length);
    if (max === 0) return 0;
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return i / max;
}

function sweep(name: string, objects: LocationObject[]): ResolvedObject {
    const lower = name.toLowerCase();

    const exact = objects.filter(o => o.desc && o.desc.toLowerCase() === lower);
    if (exact.length === 1) return { id: exact[0].num, ambiguous: false };
    if (exact.length > 1) return { id: exact[0].num, ambiguous: true, candidates: exact.map(o => o.num) };

    const nameWords = words(name).length;
    const scored: Scored[] = [];
    for (const obj of objects) {
        if (!obj.desc) continue;
        // wordListMatchScore averages over the shorter of the two word lists, so
        // the floor follows that list: one word alone cannot average away its
        // own declension.
        const floor = Math.min(nameWords, words(obj.desc).length) <= 1
            ? MIN_SCORE_SINGLE
            : MIN_SCORE_MULTI;
        const score = wordListMatchScore(obj.desc, name);
        if (score >= floor) scored.push({ obj, score });
    }
    if (scored.length === 0) return { ambiguous: false };

    scored.sort((a, b) => b.score - a.score);
    const tied = scored.filter(s => scored[0].score - s.score <= TIE_EPSILON);
    if (tied.length === 1) return { id: tied[0].obj.num, ambiguous: false };
    return discriminate(tied, name);
}

/**
 * Maps a name as the game rendered it - nominative, declined, or a pronoun -
 * onto an object id on the current location.
 */
export function resolveObjectId(
    name: string,
    objects: LocationObject[],
    opts: ResolveOptions = {},
): ResolvedObject {
    const raw = normalize(name);
    if (!raw) return { ambiguous: false };

    // 4.3: second-person pronouns never go near the fuzzy matcher.
    if (PLAYER_WORDS.has(raw.toLowerCase())) {
        return { id: opts.playerNum, ambiguous: false };
    }

    const attempts = opts.trimLeadingWords ? suffixes(raw) : [raw];
    let fallback: ResolvedObject = { ambiguous: false };
    for (const attempt of attempts) {
        // 4.1: a single token is almost always a player name - try the team and
        // the player first, where the lower floor is safe.
        if (words(attempt).length === 1) {
            const team = objects.filter(o => o.__category === 'team' || o.__category === 'player');
            const hit = sweep(attempt, team);
            if (hit.id !== undefined && !hit.ambiguous) return hit;
        }
        const result = sweep(attempt, objects);
        if (result.id !== undefined && !result.ambiguous) return result;
        if (result.id !== undefined && fallback.id === undefined) fallback = result;
    }
    return fallback;
}

/** "Na rozkaz Abra grozny zolnierz" -> the whole string, then without "Na", ... */
function suffixes(name: string): string[] {
    const parts = name.split(/\s+/).filter(Boolean);
    const out: string[] = [];
    for (let i = 0; i < parts.length; i++) {
        out.push(parts.slice(i).join(' '));
    }
    return out;
}
