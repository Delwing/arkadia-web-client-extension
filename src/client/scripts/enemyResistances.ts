import Client from "../Client";
import { AnsiAwareBuffer } from "@client/ansi/FormatState";
import { colorString, createColorFormat } from "@modules/core/Colors";
import { wordListMatchScore } from "@client/utils/fuzzyMatch";
import eventBus from "@modules/core/eventBus";
import {
    ensureEnemyResistancesLoaded,
    getEnemyResistanceSnapshot,
    updateEnemyResistanceSnapshot,
    upsertEnemyResistance,
    removeEnemyResistance,
    clearEnemyResistanceStore,
    enemyKind,
    type EnemyResistanceEntry,
    type ResistanceKind,
    type ResistanceTrait,
} from "@modules/data/enemyResistanceStore";

const PARSER_TAG = "enemy-resistances";

/** How long an "ocen" block stays open for the lines that follow its header. */
const CONTEXT_TTL_MS = 3000;
const MIN_OBJECT_MATCH_SCORE = 0.5;

const RESIST_COLOR = createColorFormat("#ff6347");
const VULNERABLE_COLOR = createColorFormat("#00ff7f");
const WARNING_COLOR = createColorFormat("#ffa500");

const STEM_KIND: Record<string, ResistanceKind> = {
    odporn: "odporny",
    niewrazliw: "odporny",
    wrazliw: "wrazliwy",
    podatn: "wrazliwy",
};
const STEM = "(?:odporn|niewrazliw|wrazliw|podatn)\\w*";
const CLAUSE_SPLIT = new RegExp(` oraz (?=(?:\\w+ )*?${STEM} na )`);
const CLAUSE = /^(?:(.+?) )?(odporn|niewrazliw|wrazliw|podatn)\w* na (.+)$/;

/**
 * Parses the part after "podpowiadaja ci, ze jest on", e.g.
 * "wyjatkowo odporny na kwas i magie zycia oraz wrazliwy na zywiol ognia".
 * Returns null when no clause looks like a resistance (e.g. shield parry lines).
 */
export function parseResistanceTraits(text: string): ResistanceTrait[] | null {
    const traits: ResistanceTrait[] = [];
    for (const clause of text.split(CLAUSE_SPLIT)) {
        const m = clause.trim().match(CLAUSE);
        if (!m) return null;
        const kind = STEM_KIND[m[2]];
        const degree = (m[1] ?? "").trim();
        for (const target of m[3].split(/, | i /)) {
            const t = target.trim();
            if (t) traits.push({ kind, degree, target: t });
        }
    }
    return traits.length > 0 ? traits : null;
}

/** "Wydaje ci sie, ze jestes ... niz <nominative>." -> nominative */
export function parseComparisonName(line: string): string | null {
    const m = line.match(/^Wydaje ci sie, ze jestes .+ (?:niz|jak) (.+)\.$/);
    return m ? m[1].trim() : null;
}

type LocationObject = { desc?: string; __category?: string };

/**
 * Fallback when the comparison line is missing: find the object on location whose
 * nominative desc best matches the declined header name.
 */
export function resolveFromObjects(declined: string, objects: LocationObject[]): string | null {
    let best: string | null = null;
    let bestScore = MIN_OBJECT_MATCH_SCORE;
    for (const obj of objects) {
        if (!obj.desc || obj.__category === "player" || obj.__category === "team") continue;
        const score = wordListMatchScore(obj.desc, declined);
        if (score > bestScore) {
            bestScore = score;
            best = obj.desc;
        }
    }
    return best;
}

/** Appends a warning that copies the offending game line on click, so it can be reported. */
function appendParseWarning(line: AnsiAwareBuffer, reason: string): AnsiAwareBuffer {
    const lineText = line.text;
    const warn = `[odpornosci] ${reason} - kliknij, aby skopiowac linie i zglosic.`;
    const warnBuffer = colorString(warn, WARNING_COLOR);
    warnBuffer.createLink([0, warn.length], {
        onClick: () => void navigator.clipboard?.writeText(lineText),
        title: "Kopiuj linie",
    });
    return line.append("\n", {}).appendBuffer(warnBuffer);
}

interface PendingEval {
    at: number;
    header?: string;
    name?: string;
}

function formatTraits(traits: ResistanceTrait[]): AnsiAwareBuffer {
    const groups = new Map<string, { kind: ResistanceKind; degree: string; targets: string[] }>();
    for (const t of traits) {
        const key = `${t.kind}|${t.degree}`;
        const group = groups.get(key) ?? { kind: t.kind, degree: t.degree, targets: [] };
        group.targets.push(t.target);
        groups.set(key, group);
    }
    const out = new AnsiAwareBuffer();
    let first = true;
    for (const g of groups.values()) {
        if (!first) out.append("; ", {});
        first = false;
        const label = [g.degree, g.kind].filter(Boolean).join(" ");
        const color = g.kind === "odporny" ? RESIST_COLOR : VULNERABLE_COLOR;
        out.appendBuffer(colorString(`${label} na ${g.targets.join(", ")}`, color));
    }
    return out;
}

export default function initEnemyResistances(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[],
) {
    const list = aliases ?? client.aliases;
    let ctx: PendingEval | null = null;

    void ensureEnemyResistancesLoaded();

    const freshCtx = (): PendingEval | null =>
        ctx && Date.now() - ctx.at <= CONTEXT_TTL_MS ? ctx : null;

    const resolveName = (c: PendingEval): string | null => {
        if (c.name) return c.name;
        if (!c.header) return null;
        const objects = client.ObjectManager?.getObjectsOnLocation?.() ?? [];
        return resolveFromObjects(c.header, objects);
    };

    const openCtx = (header: string) => {
        ctx = { at: Date.now(), header };
    };

    client.Triggers.registerTrigger(
        /^Ogladasz dokladnie (.+)\.$/,
        (line, m) => {
            openCtx(m[1]);
            return line;
        },
        PARSER_TAG,
    );

    client.Triggers.registerTrigger(
        /^Oceniasz (?!starannie )([^,]+)\.$/,
        (line, m) => {
            openCtx(m[1]);
            return line;
        },
        PARSER_TAG,
    );

    client.Triggers.registerTrigger(
        /^Wydaje ci sie, ze jestes .+ (?:niz|jak) .+\.$/,
        (line, m) => {
            const name = parseComparisonName(m[0]);
            if (!name) return line;
            const c = freshCtx();
            if (c) c.name = name;
            else ctx = { at: Date.now(), name };
            return line;
        },
        PARSER_TAG,
    );

    // Item evaluations share the "podpowiadaja ci" line - never read them as an enemy.
    client.Triggers.registerTrigger(
        /^Oceniasz starannie /,
        (line) => {
            ctx = null;
            return line;
        },
        PARSER_TAG,
    );

    client.Triggers.registerTrigger(
        /^Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze (.+)$/,
        (line, m) => {
            const c = freshCtx();
            if (!c) return line;
            ctx = null;
            const phrase = m[1].match(/^jest (?:on|ona|ono) (.+)\.$/)?.[1];
            const traits = phrase ? parseResistanceTraits(phrase) : null;
            if (!phrase || !traits) {
                return appendParseWarning(line, "Nie udalo sie odczytac odpornosci");
            }
            const resolved = resolveName(c);
            if (!resolved) {
                return appendParseWarning(line, "Nie udalo sie rozpoznac przeciwnika, odpornosci nie zapisano");
            }
            // Capitalized nominative means a player or a named NPC, not a mob kind.
            if (/^[A-Z]/.test(resolved)) return line;
            const name = enemyKind(resolved);
            const entry: EnemyResistanceEntry = {
                name,
                traits,
                raw: phrase,
                roomId: client.Map?.currentRoom?.id ?? null,
                updatedAt: Date.now(),
            };
            void updateEnemyResistanceSnapshot(s => ({
                entries: upsertEnemyResistance(s.entries, entry),
            }));
            return line;
        },
        PARSER_TAG,
    );

    list.push({
        pattern: /^\/odpornosci(?:\s+(.+))?$/,
        callback: (m: RegExpMatchArray) => {
            const phrase = m[1]?.trim().toLowerCase();
            if (!phrase) {
                eventBus.emit("enemyResistances.popup.open");
                return;
            }
            const entries = getEnemyResistanceSnapshot().entries
                .filter(e => e.name.includes(enemyKind(phrase)))
                .sort((a, b) => a.name.localeCompare(b.name));
            if (entries.length === 0) {
                client.println(`Brak zapisanych odpornosci dla "${phrase}".`);
                return;
            }
            const out = new AnsiAwareBuffer();
            out.append(`--- odpornosci (${entries.length}) ---\n`, { bold: true });
            for (const e of entries) {
                out.append(`${e.name}: `, { bold: true });
                out.appendBuffer(formatTraits(e.traits));
                out.append("\n", {});
            }
            client.println(out);
        },
    });

    list.push({
        pattern: /^\/odpornosci-usun\s+(.+)$/,
        callback: (m: RegExpMatchArray) => {
            const name = m[1].trim();
            void removeEnemyResistance(name).then(removed => {
                client.println(removed
                    ? `Usunieto odpornosci: ${name}.`
                    : `Nie znaleziono wpisu: ${name}.`);
            });
        },
    });

    list.push({
        pattern: /^\/odpornosci-reset$/,
        callback: () => {
            void clearEnemyResistanceStore();
            client.println("Baza odpornosci wyczyszczona.");
        },
    });
}
