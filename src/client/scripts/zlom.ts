import Client from "../Client";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";
import { AnsiAwareBuffer } from "@client/ansi/FormatState";
import { ARMOR_QUALITY, BALANCE, EFFECTIVENESS } from "./evaluationConstants";
import eventBus from "@modules/core/eventBus";
import {
    ensureZlomLoaded,
    getZlomSnapshot,
    subscribeZlom,
    updateZlomSnapshot,
    clearZlomStore,
    upsertByOpis,
    type WeaponEntry,
    type ArmorEntry,
    type ShieldEntry,
    type ZlomEntry,
    type ZlomKind,
    type ZlomSnapshot,
} from "@modules/data/zlomStore";

export type {
    WeaponEntry,
    ArmorEntry,
    ShieldEntry,
    ZlomEntry,
    ZlomKind,
    ZlomSnapshot,
};

const HIGHLIGHT_TAG = "zlom-highlight";
const PARSER_TAG = "zlom-parser";

const SILVER_TYP_TOOLTIP = "srebro";
const COMBAT_LINE_TYPES = new Set(["combat.avatar", "combat.team", "combat.others"]);

function resolveSilverColor(): string | undefined {
    const silver = characterStorage.get('settings')?.zlomSilver ?? defaultSettings.zlomSilver;
    if (!silver || silver.off) return undefined;
    const color = silver.color?.trim();
    return color || undefined;
}

type Kind = "bron" | "zbroja" | "tarcza";

interface PendingEval {
    opis?: string;
    short?: string;
    shortAlt?: string;
    waga?: number;
    obj?: number;
    cena?: number;
    rodzaj?: string;
    chwyt?: string;
    obrazenia?: string;
    typ?: string;
    oslona?: string;
    wywazenie?: number;
    parowanie?: number;
    magik?: 0 | 1;
    srebro?: 0 | 1;
    klute?: number;
    obuch?: number;
    ciete?: number;
    kind?: Kind;
    armorType?: string;
    awaitingOpis?: boolean;
}

const DAMAGE_MAP: Record<string, keyof ArmorProtection> = {
    klutymi: "klute",
    cietymi: "ciete",
    obuchowymi: "obuch",
};

interface ArmorProtection {
    klute: number;
    ciete: number;
    obuch: number;
}

function parseWeightObj(waga: string, wagaJ: string, obj: string, objJ: string): { waga: number; obj: number } {
    let w = parseInt(waga, 10);
    let o = parseInt(obj, 10);
    if (wagaJ === "kilogram") w *= 1000;
    if (objJ === "litr") o *= 1000;
    return { waga: w, obj: o };
}

function balanceValue(raw: string): number {
    return BALANCE[raw.trim().toLowerCase()]?.value ?? 0;
}

function effectivenessValue(raw: string): number {
    const lower = raw.trim().toLowerCase();
    const key = Object.keys(EFFECTIVENESS).find((k) => lower.startsWith(k));
    return key ? EFFECTIVENESS[key].value : 0;
}

function armorQualityValue(raw: string): number {
    return ARMOR_QUALITY[raw.trim().toLowerCase()]?.value ?? 0;
}

function extractArmorProtection(text: string): { prot: ArmorProtection; parry?: string } | undefined {
    let parry: string | undefined;
    const parryMatch = text.match(/Ponadto jest (.*) w parowaniu ciosow\./);
    if (parryMatch) {
        parry = parryMatch[1].trim();
        text = text.replace(parryMatch[0], "").trim();
    }

    const p1 = text.match(
        /(.*) przed obrazeniami (klutymi|cietymi|obuchowymi), (.*) przed (klutymi|cietymi|obuchowymi) i (.*) przed (klutymi|cietymi|obuchowymi)\./,
    );
    if (p1) {
        const prot: ArmorProtection = { klute: 0, ciete: 0, obuch: 0 };
        prot[DAMAGE_MAP[p1[2]]] = armorQualityValue(p1[1]);
        prot[DAMAGE_MAP[p1[4]]] = armorQualityValue(p1[3]);
        prot[DAMAGE_MAP[p1[6]]] = armorQualityValue(p1[5]);
        return { prot, parry };
    }

    const p2 = text.match(
        /(.*) przed obrazeniami (klutymi|cietymi|obuchowymi), (klutymi|cietymi|obuchowymi) i (klutymi|cietymi|obuchowymi)\./,
    );
    if (p2) {
        const prot: ArmorProtection = { klute: 0, ciete: 0, obuch: 0 };
        const q = armorQualityValue(p2[1]);
        [p2[2], p2[3], p2[4]].forEach((t) => {
            prot[DAMAGE_MAP[t]] = q;
        });
        return { prot, parry };
    }

    const p3 = text.match(
        /(.*) przed obrazeniami (cietymi|klutymi|obuchowymi) i (klutymi|cietymi|obuchowymi) oraz (.*) przed (klutymi|cietymi|obuchowymi)\./,
    );
    if (p3) {
        const prot: ArmorProtection = { klute: 0, ciete: 0, obuch: 0 };
        const q1 = armorQualityValue(p3[1]);
        prot[DAMAGE_MAP[p3[2]]] = q1;
        prot[DAMAGE_MAP[p3[3]]] = q1;
        prot[DAMAGE_MAP[p3[5]]] = armorQualityValue(p3[4]);
        return { prot, parry };
    }

    const p4 = text.match(/(.*) przed obrazeniami (klutymi|cietymi|obuchowymi)\./);
    if (p4) {
        const q = armorQualityValue(p4[1]);
        const prot: ArmorProtection = { klute: q, ciete: q, obuch: q };
        prot[DAMAGE_MAP[p4[2]]] = q;
        return { prot, parry };
    }

    return undefined;
}

export type ZlomMergeMode = 'replace' | 'keep';

export interface ZlomImportPayload {
    bronie: WeaponEntry[];
    tarcze: ShieldEntry[];
    zbroje: ArmorEntry[];
}

export interface ZlomImportCounts {
    bronie: number;
    tarcze: number;
    zbroje: number;
}

export async function mergeZlomData(
    data: ZlomImportPayload,
    mode: ZlomMergeMode = 'replace',
): Promise<ZlomImportCounts> {
    let counts: ZlomImportCounts = { bronie: 0, tarcze: 0, zbroje: 0 };
    await updateZlomSnapshot(current => {
        const merge = <T extends ZlomEntry>(dst: T[], src: T[]): { list: T[]; count: number } => {
            let list = dst.slice();
            let count = 0;
            for (const e of src) {
                if (!e.opis) continue;
                const idx = list.findIndex(x => x.opis === e.opis);
                if (idx >= 0) {
                    if (mode === 'keep') continue;
                    const prev = list[idx];
                    const merged: T = { ...e };
                    if (!merged.color && prev.color) merged.color = prev.color;
                    list[idx] = merged;
                } else {
                    list.push(e);
                }
                count++;
            }
            return { list, count };
        };
        const b = merge(current.bronie, data.bronie);
        const t = merge(current.tarcze, data.tarcze);
        const z = merge(current.zbroje, data.zbroje);
        counts = { bronie: b.count, tarcze: t.count, zbroje: z.count };
        return { bronie: b.list, tarcze: t.list, zbroje: z.list };
    });
    eventBus.emit('zlom.snapshotReplaced');
    return counts;
}

export async function clearZlomData(): Promise<void> {
    await clearZlomStore();
    eventBus.emit('zlom.snapshotReplaced');
}

export async function setZlomColor(
    kind: ZlomKind,
    opis: string,
    color: string | undefined,
): Promise<void> {
    await updateZlomSnapshot(current => {
        const list = (current[kind] as ZlomEntry[]).map(e => {
            if (e.opis !== opis) return e;
            if (color) return { ...e, color };
            const { color: _, ...rest } = e;
            return rest as ZlomEntry;
        });
        return { ...current, [kind]: list } as ZlomSnapshot;
    });
    eventBus.emit('zlom.snapshotReplaced');
}

export async function setZlomNote(
    kind: ZlomKind,
    opis: string,
    note: string | undefined,
): Promise<void> {
    const trimmed = note?.trim();
    await updateZlomSnapshot(current => {
        const list = (current[kind] as ZlomEntry[]).map(e => {
            if (e.opis !== opis) return e;
            if (trimmed) return { ...e, note: trimmed };
            const { note: _, ...rest } = e;
            return rest as ZlomEntry;
        });
        return { ...current, [kind]: list } as ZlomSnapshot;
    });
    eventBus.emit('zlom.snapshotReplaced');
}

export interface ZlomFormatting {
    color?: string;
    title?: string;
    silver?: boolean;
}

function computeFormatting(entry: ZlomEntry, silverColor: string | undefined): ZlomFormatting | undefined {
    if (entry.magik === 1) return undefined;
    const silver = (entry as WeaponEntry).srebro === 1;
    const autoSilver = silver ? silverColor : undefined;
    const color = entry.color ?? autoSilver;
    if (!color) return undefined;
    const parts: string[] = [];
    if ((entry as WeaponEntry).typ) parts.push((entry as WeaponEntry).typ);
    else if ((entry as ShieldEntry).oslona) parts.push('tarcza');
    if (silver) parts.push(SILVER_TYP_TOOLTIP);
    return {
        color,
        title: parts.length ? parts.join(' / ') : undefined,
        silver: silver || undefined,
    };
}

function entryNames(e: ZlomEntry): string[] {
    const names: string[] = [];
    if (e.short) names.push(e.short);
    if (e.shortAlt && e.shortAlt !== e.short) names.push(e.shortAlt);
    return names;
}

function findEntryByShort(name: string): ZlomEntry | undefined {
    if (!name) return undefined;
    const snap = getZlomSnapshot();
    const lower = name.toLowerCase();
    const scan = (list: ZlomEntry[]): ZlomEntry | undefined => {
        for (const e of list) {
            for (const n of entryNames(e)) {
                if (n === name) return e;
            }
        }
        for (const e of list) {
            for (const n of entryNames(e)) {
                if (lower.includes(n.toLowerCase())) return e;
            }
        }
        return undefined;
    };
    return scan(snap.bronie as ZlomEntry[])
        ?? scan(snap.tarcze as ZlomEntry[])
        ?? scan(snap.zbroje as ZlomEntry[]);
}

export function getZlomFormatting(name: string): ZlomFormatting | undefined {
    const entry = findEntryByShort(name);
    if (!entry) return undefined;
    return computeFormatting(entry, resolveSilverColor());
}

function registerHighlight(client: Client, entry: ZlomEntry) {
    for (const name of entryNames(entry)) {
        const needle = name.toLowerCase();
        client.Triggers.registerTokenTrigger(
            name,
            (line, _matches, type) => {
                if (COMBAT_LINE_TYPES.has(type)) return line;
                const idx = line.text.toLowerCase().indexOf(needle);
                if (idx === -1) return line;
                const end = idx + name.length;
                const fmt = computeFormatting(entry, resolveSilverColor());
                if (!fmt) return line;
                line.applyFormat([idx, end], { foreground: { space: 'hex', color: fmt.color! } });
                return line;
            },
            HIGHLIGHT_TAG,
            { caseInsensitive: true },
        );
    }
}

function collectHighlightEntries(snap: ZlomSnapshot, silverColor: string | undefined): ZlomEntry[] {
    const byShort = new Map<string, ZlomEntry>();
    const consider = (list: ZlomEntry[]) => {
        for (const e of list) {
            if (!e.short) continue;
            if (!computeFormatting(e, silverColor)) continue;
            const prev = byShort.get(e.short);
            if (!prev || (!prev.color && e.color)) {
                byShort.set(e.short, e);
            }
        }
    };
    consider(snap.bronie as ZlomEntry[]);
    consider(snap.tarcze as ZlomEntry[]);
    consider(snap.zbroje as ZlomEntry[]);
    return Array.from(byShort.values());
}

function reinstallHighlights(client: Client) {
    client.Triggers.removeByTag(HIGHLIGHT_TAG);
    for (const entry of collectHighlightEntries(getZlomSnapshot(), resolveSilverColor())) {
        registerHighlight(client, entry);
    }
}

export default function initZlom(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[],
): void {
    // Load the snapshot from IndexedDB, then install highlight triggers.
    ensureZlomLoaded().then(() => reinstallHighlights(client));

    subscribeZlom(() => reinstallHighlights(client));
    eventBus.on('zlom.snapshotReplaced', () => reinstallHighlights(client));

    let lastSilverColor = resolveSilverColor();
    characterStorage.onChange('settings', () => {
        const next = resolveSilverColor();
        if (next !== lastSilverColor) {
            lastSilverColor = next;
            reinstallHighlights(client);
        }
    });

    let ctx: PendingEval | null = null;

    const roomId = (): number | null => client.Map?.currentRoom?.id ?? null;

    const altShort = (): string | undefined =>
        ctx?.shortAlt && ctx.shortAlt !== ctx.short ? ctx.shortAlt : undefined;

    const persistBron = () => {
        if (!ctx || ctx.kind !== "bron" || !ctx.short || !ctx.opis) return;
        const entry: WeaponEntry = {
            short: ctx.short,
            shortAlt: altShort(),
            typ: ctx.typ ?? "",
            rodzaj: ctx.rodzaj ?? "",
            klute: ctx.klute ?? 0,
            obuch: ctx.obuch ?? 0,
            ciete: ctx.ciete ?? 0,
            chwyt: ctx.chwyt ?? "",
            magik: ctx.magik ?? 0,
            srebro: ctx.srebro ?? 0,
            opis: ctx.opis,
            waga: ctx.waga ?? 0,
            obj: ctx.obj ?? 0,
            cena: ctx.cena ?? 0,
            wywazenie: ctx.wywazenie ?? 0,
            parowanie: ctx.parowanie ?? 0,
            roomId: roomId(),
        };
        void updateZlomSnapshot(s => ({ ...s, bronie: upsertByOpis(s.bronie, entry) }));
    };

    const persistZbroja = () => {
        if (!ctx || ctx.kind !== "zbroja" || !ctx.short || !ctx.opis) return;
        const entry: ArmorEntry = {
            short: ctx.short,
            shortAlt: altShort(),
            typ: ctx.armorType ?? "",
            klute: ctx.klute ?? 0,
            obuch: ctx.obuch ?? 0,
            ciete: ctx.ciete ?? 0,
            magik: ctx.magik ?? 0,
            opis: ctx.opis,
            waga: ctx.waga ?? 0,
            obj: ctx.obj ?? 0,
            cena: ctx.cena ?? 0,
            oslona: ctx.oslona ?? "",
            roomId: roomId(),
        };
        void updateZlomSnapshot(s => ({ ...s, zbroje: upsertByOpis(s.zbroje, entry) }));
    };

    const persistTarcza = () => {
        if (!ctx || ctx.kind !== "tarcza" || !ctx.short || !ctx.opis) return;
        const entry: ShieldEntry = {
            short: ctx.short,
            shortAlt: altShort(),
            klute: ctx.klute ?? 0,
            obuch: ctx.obuch ?? 0,
            ciete: ctx.ciete ?? 0,
            magik: ctx.magik ?? 0,
            opis: ctx.opis,
            waga: ctx.waga ?? 0,
            obj: ctx.obj ?? 0,
            cena: ctx.cena ?? 0,
            parowanie: ctx.parowanie ?? 0,
            oslona: ctx.oslona ?? "",
            roomId: roomId(),
        };
        void updateZlomSnapshot(s => ({ ...s, tarcze: upsertByOpis(s.tarcze, entry) }));
    };

    client.Triggers.registerTrigger(
        /^Oceniasz starannie (.+)\.$/,
        (line, m) => {
            ctx = { awaitingOpis: true, shortAlt: m[1] };
            return line;
        },
        PARSER_TAG,
    );

    client.Triggers.registerTrigger(
        /^(.+)$/,
        (line, m) => {
            if (!ctx || !ctx.awaitingOpis) return line;
            const text = m[1];
            if (
                /^Oceniasz starannie /.test(text) ||
                /^Oceniasz, ze /.test(text) ||
                /^Wyglada na to, /.test(text)
            ) {
                return line;
            }
            ctx.opis = text;
            ctx.awaitingOpis = false;
            return line;
        },
        PARSER_TAG,
    );

    client.Triggers.registerTrigger(
        /^Oceniasz, ze (.+?) waz[ay] (\d+) (kilogram|gram)\w*, zas \w+ objetosc wynosi (\d+) (mililitr|litr)\w*\.$/,
        (line, m) => {
            if (!ctx) return line;
            ctx.short = m[1];
            const parsed = parseWeightObj(m[2], m[3], m[4], m[5]);
            ctx.waga = parsed.waga;
            ctx.obj = parsed.obj;
            ctx.awaitingOpis = false;
            return line;
        },
        PARSER_TAG,
    );

    client.Triggers.registerTrigger(
        /^Wydaje ci sie, ze (?:jest|sa) wart[aye]? okolo (\d+) mied\w+\.$/,
        (line, m) => {
            if (!ctx) return line;
            ctx.cena = parseInt(m[1], 10);
            return line;
        },
        PARSER_TAG,
    );

    client.Triggers.registerTrigger(
        /^Zauwazasz, iz (.+?) (?:jest|sa) przystosowan\w* do chwytania (.+?)\.$/,
        (line, m) => {
            if (!ctx) return line;
            ctx.kind = "bron";
            ctx.rodzaj = m[1];
            ctx.chwyt = m[2];
            return line;
        },
        PARSER_TAG,
    );

    client.Triggers.registerTrigger(
        /^Za (?:jego|jej|ich) pomoca mozna zadawac rany (.+?)\.$/,
        (line, m) => {
            if (!ctx || ctx.kind !== "bron") return line;
            const w = m[1];
            ctx.obrazenia = w;
            ctx.klute = /klute/.test(w) ? 1 : 0;
            ctx.obuch = /obuch/.test(w) ? 1 : 0;
            ctx.ciete = /ciete/.test(w) ? 1 : 0;
            return line;
        },
        PARSER_TAG,
    );

    client.Triggers.registerTrigger(
        /^Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jak na (.+?) (?:jest|sa) on\w* (.+?) wywazon\w* i (.+?)\.$/,
        (line, m) => {
            if (!ctx || ctx.kind !== "bron") return line;
            ctx.typ = m[1].replace(/maczuge/g, "maczuga").trim();
            ctx.wywazenie = balanceValue(m[2]);
            ctx.parowanie = effectivenessValue(m[3]);
            persistBron();
            return line;
        },
        PARSER_TAG,
    );

    client.Triggers.registerTrigger(
        /^Sadzac po delikatnym drzeniu w broni tej zostala zakleta jakas magia,/,
        (line) => {
            if (!ctx || ctx.kind !== "bron" || !ctx.short) return line;
            ctx.magik = 1;
            persistBron();
            return line;
        },
        PARSER_TAG,
    );

    client.Triggers.registerTrigger(
        /^Do wykonania tej broni uzyto srebra,/,
        (line) => {
            if (!ctx || ctx.kind !== "bron" || !ctx.short) return line;
            ctx.srebro = 1;
            persistBron();
            return line;
        },
        PARSER_TAG,
    );

    client.Triggers.registerTrigger(
        /^Zaklada sie (?:go|ja) na (.+?)\.$/,
        (line, m) => {
            if (!ctx) return line;
            ctx.oslona = m[1];
            return line;
        },
        PARSER_TAG,
    );

    client.Triggers.registerTrigger(
        /^Zalozon[ya] oslania (.+?)\.$/,
        (line, m) => {
            if (!ctx) return line;
            ctx.oslona = m[1];
            return line;
        },
        PARSER_TAG,
    );

    client.Triggers.registerTrigger(
        /^Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest ona? (.+?) w parowaniu ciosow\.$/,
        (line, m) => {
            if (!ctx || !ctx.short) return line;
            ctx.kind = "tarcza";
            ctx.parowanie = effectivenessValue(m[1]);
            ctx.klute = ctx.klute ?? 0;
            ctx.obuch = ctx.obuch ?? 0;
            ctx.ciete = ctx.ciete ?? 0;
            persistTarcza();
            return line;
        },
        PARSER_TAG,
    );

    client.Triggers.registerTrigger(
        /^Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze (jak na (lekka|srednia|ciezka) zbroje (chroni|chronia)|(chroni|chronia)) (on|ona|one) (.*)$/,
        (line, m) => {
            if (!ctx) return line;
            const armorType = m[2];
            const rest = m[6];
            const extracted = extractArmorProtection(rest);
            if (!extracted) return line;
            const { prot, parry } = extracted;
            ctx.klute = prot.klute;
            ctx.obuch = prot.obuch;
            ctx.ciete = prot.ciete;
            if (armorType) {
                ctx.kind = "zbroja";
                ctx.armorType = armorType;
                persistZbroja();
            } else {
                ctx.kind = "tarcza";
                ctx.parowanie = parry ? effectivenessValue(parry) : 0;
                persistTarcza();
            }
            return line;
        },
        PARSER_TAG,
    );

    client.Triggers.registerTrigger(
        /^Sadzac po delikatnym drzeniu w zbroi tej zostala zakleta jakas magia/,
        (line) => {
            if (!ctx || !ctx.short) return line;
            ctx.magik = 1;
            if (ctx.kind === "zbroja") persistZbroja();
            else if (ctx.kind === "tarcza") persistTarcza();
            return line;
        },
        PARSER_TAG,
    );

    if (aliases) {
        aliases.push({
            pattern: /^\/zlom(?:\s+(bronie|tarcze|zbroje))?$/,
            callback: (m: RegExpMatchArray) => {
                const kind = (m[1] ?? 'bronie') as ZlomKind;
                const entries: ZlomEntry[] = getZlomSnapshot()[kind] as ZlomEntry[];
                if (entries.length === 0) {
                    client.println(`Brak zapisanych pozycji w tabeli ${kind}.`);
                    return;
                }
                const out = new AnsiAwareBuffer();
                out.append(`--- zlom: ${kind} (${entries.length}) ---\n`, { bold: true });
                for (const e of entries) {
                    const prot = `${e.klute}/${e.obuch}/${e.ciete}`;
                    out.append(`${e.short}  `, { bold: true });
                    out.append(`[${prot}] ${e.cena ?? 0}mi ${e.waga ?? 0}g\n`, {});
                }
                client.println(out);
            },
        });

        aliases.push({
            pattern: /^\/zlomw$/,
            callback: () => eventBus.emit('zlom.popup.open'),
        });

        aliases.push({
            pattern: /^\/zlom-reset$/,
            callback: () => {
                void clearZlomData();
                client.println('Baza zlomu wyczyszczona.');
            },
        });
    }
}
