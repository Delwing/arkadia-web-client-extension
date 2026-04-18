import Client from "../Client";
import { characterStorage } from "@modules/core/storage";
import { AnsiAwareBuffer, FormatStateSnapshot } from "@client/ansi/FormatState";
import { ARMOR_QUALITY, BALANCE, EFFECTIVENESS } from "./evaluationConstants";
import eventBus from "@modules/core/eventBus";

export interface WeaponEntry {
    short: string;
    typ: string;
    rodzaj: string;
    klute: number;
    obuch: number;
    ciete: number;
    chwyt: string;
    magik: 0 | 1;
    srebro: 0 | 1;
    opis: string;
    waga: number;
    obj: number;
    cena: number;
    wywazenie: number;
    parowanie: number;
    roomId: number | null;
    color?: string;
}

export interface ArmorEntry {
    short: string;
    typ: string;
    klute: number;
    obuch: number;
    ciete: number;
    magik: 0 | 1;
    opis: string;
    waga: number;
    obj: number;
    cena: number;
    oslona: string;
    roomId: number | null;
    color?: string;
}

export interface ShieldEntry {
    short: string;
    klute: number;
    obuch: number;
    ciete: number;
    magik: 0 | 1;
    opis: string;
    waga: number;
    obj: number;
    cena: number;
    parowanie: number;
    oslona: string;
    roomId: number | null;
    color?: string;
}

export type ZlomEntry = WeaponEntry | ShieldEntry | ArmorEntry;
export type ZlomKind = 'bronie' | 'tarcze' | 'zbroje';

export interface ZlomSnapshot {
    bronie: Record<string, WeaponEntry>;
    tarcze: Record<string, ShieldEntry>;
    zbroje: Record<string, ArmorEntry>;
}

export const ZLOM_STORAGE_KEY = "zlom";
const HIGHLIGHT_TAG = "zlom-highlight";
const PARSER_TAG = "zlom-parser";

const SILVER_TYP_TOOLTIP = "srebro";

type Kind = "bron" | "zbroja" | "tarcza";

interface PendingEval {
    opis?: string;
    short?: string;
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

function emptySnapshot(): ZlomSnapshot {
    return { bronie: {}, tarcze: {}, zbroje: {} };
}

export function loadZlomSnapshot(): ZlomSnapshot {
    const stored = characterStorage.get(ZLOM_STORAGE_KEY) as ZlomSnapshot | undefined;
    if (!stored) return emptySnapshot();
    return {
        bronie: stored.bronie ?? {},
        tarcze: stored.tarcze ?? {},
        zbroje: stored.zbroje ?? {},
    };
}

export function saveZlomSnapshot(s: ZlomSnapshot): void {
    characterStorage.set(ZLOM_STORAGE_KEY, s);
    eventBus.emit("zlom.updated");
}

export function setZlomColor(kind: ZlomKind, short: string, color: string | undefined): void {
    const snap = loadZlomSnapshot();
    const entry = (snap[kind] as Record<string, ZlomEntry>)[short];
    if (!entry) return;
    if (color) entry.color = color;
    else delete entry.color;
    saveZlomSnapshot(snap);
    eventBus.emit("zlom.snapshotReplaced");
}

export interface ZlomFormatting {
    color?: string;
    underline: boolean;
    title?: string;
}

/**
 * Returns the zlom-driven formatting for an item name, or undefined if no saved entry matches.
 * Uses character's zlom snapshot plus zlomColorSilver setting for silver underline.
 */
export function getZlomFormatting(name: string, opts: { colorSilver?: boolean } = {}): ZlomFormatting | undefined {
    if (!name) return undefined;
    const snap = loadZlomSnapshot();
    const lower = name.toLowerCase();
    const scan = (records: Record<string, ZlomEntry>): ZlomEntry | undefined => {
        if (records[name]) return records[name];
        for (const key of Object.keys(records)) {
            if (lower.includes(key.toLowerCase())) return records[key];
        }
        return undefined;
    };
    const entry = scan(snap.bronie) ?? scan(snap.tarcze) ?? scan(snap.zbroje);
    if (!entry) return undefined;
    const silver = (entry as WeaponEntry).srebro === 1;
    const magic = entry.magik === 1;
    const underline = silver && (opts.colorSilver ?? true);
    const titleParts: string[] = [];
    if ((entry as WeaponEntry).typ) titleParts.push((entry as WeaponEntry).typ);
    else if ((entry as ShieldEntry).oslona) titleParts.push('tarcza');
    if (silver) titleParts.push(SILVER_TYP_TOOLTIP);
    if (magic) titleParts.push('magia');
    return {
        color: entry.color,
        underline,
        title: titleParts.length ? titleParts.join(' / ') : undefined,
    };
}

function emitSnapshotReplaced(): void {
    eventBus.emit("zlom.snapshotReplaced");
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

export function mergeZlomData(data: ZlomImportPayload, mode: ZlomMergeMode = 'replace'): ZlomImportCounts {
    const snap = loadZlomSnapshot();
    let b = 0, t = 0, z = 0;
    for (const e of data.bronie) {
        if (!e.short) continue;
        if (mode === 'keep' && snap.bronie[e.short]) continue;
        snap.bronie[e.short] = e;
        b++;
    }
    for (const e of data.tarcze) {
        if (!e.short) continue;
        if (mode === 'keep' && snap.tarcze[e.short]) continue;
        snap.tarcze[e.short] = e;
        t++;
    }
    for (const e of data.zbroje) {
        if (!e.short) continue;
        if (mode === 'keep' && snap.zbroje[e.short]) continue;
        snap.zbroje[e.short] = e;
        z++;
    }
    saveZlomSnapshot(snap);
    emitSnapshotReplaced();
    return { bronie: b, tarcze: t, zbroje: z };
}

export function clearZlomData(): void {
    saveZlomSnapshot(emptySnapshot());
    emitSnapshotReplaced();
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

function registerHighlight(client: Client, entry: ZlomEntry) {
    const short = entry.short;
    if (!short) return;
    client.Triggers.registerTrigger(
        new RegExp(escapeRegex(short)),
        (line) => {
            const idx = line.text.indexOf(short);
            if (idx === -1) return line;
            const end = idx + short.length;
            const silverOn = characterStorage.get('settings')?.zlomColorSilver !== false;
            const silver = (entry as WeaponEntry).srebro === 1;
            const fmt: FormatStateSnapshot = { bold: true };
            if (silver && silverOn) fmt.underline = true;
            if (entry.color) fmt.foreground = { space: 'hex', color: entry.color };
            line.applyFormat([idx, end], fmt);
            line.createLink([idx, end], {
                title: buildHintForEntry(entry),
                onClick: () => {},
            });
            return line;
        },
        HIGHLIGHT_TAG,
    );
}

function buildHintForEntry(entry: ZlomEntry): string {
    const parts: string[] = [];
    const typ = (entry as WeaponEntry).typ || (entry as ShieldEntry).oslona || '';
    if (typ) parts.push(typ);
    if ((entry as WeaponEntry).srebro === 1) parts.push(SILVER_TYP_TOOLTIP);
    if (entry.magik === 1) parts.push('magia');
    return parts.join(' / ');
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function reinstallHighlights(client: Client, snap: ZlomSnapshot) {
    client.Triggers.removeByTag(HIGHLIGHT_TAG);
    for (const b of Object.values(snap.bronie)) {
        registerHighlight(client, b);
    }
    for (const t of Object.values(snap.tarcze)) {
        registerHighlight(client, t);
    }
    for (const z of Object.values(snap.zbroje)) {
        registerHighlight(client, z);
    }
}

export default function initZlom(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[],
): void {
    let snap = loadZlomSnapshot();
    reinstallHighlights(client, snap);

    let ctx: PendingEval | null = null;

    const roomId = (): number | null => client.Map?.currentRoom?.id ?? null;

    const persistBron = () => {
        if (!ctx || ctx.kind !== "bron" || !ctx.short) return;
        const entry: WeaponEntry = {
            short: ctx.short,
            typ: ctx.typ ?? "",
            rodzaj: ctx.rodzaj ?? "",
            klute: ctx.klute ?? 0,
            obuch: ctx.obuch ?? 0,
            ciete: ctx.ciete ?? 0,
            chwyt: ctx.chwyt ?? "",
            magik: ctx.magik ?? 0,
            srebro: ctx.srebro ?? 0,
            opis: ctx.opis ?? "",
            waga: ctx.waga ?? 0,
            obj: ctx.obj ?? 0,
            cena: ctx.cena ?? 0,
            wywazenie: ctx.wywazenie ?? 0,
            parowanie: ctx.parowanie ?? 0,
            roomId: roomId(),
        };
        const prev = snap.bronie[entry.short];
        if (prev?.color) entry.color = prev.color;
        snap.bronie[entry.short] = entry;
        saveZlomSnapshot(snap);
        registerHighlight(client, entry);
    };

    const persistZbroja = () => {
        if (!ctx || ctx.kind !== "zbroja" || !ctx.short) return;
        const entry: ArmorEntry = {
            short: ctx.short,
            typ: ctx.armorType ?? "",
            klute: ctx.klute ?? 0,
            obuch: ctx.obuch ?? 0,
            ciete: ctx.ciete ?? 0,
            magik: ctx.magik ?? 0,
            opis: ctx.opis ?? "",
            waga: ctx.waga ?? 0,
            obj: ctx.obj ?? 0,
            cena: ctx.cena ?? 0,
            oslona: ctx.oslona ?? "",
            roomId: roomId(),
        };
        const prev = snap.zbroje[entry.short];
        if (prev?.color) entry.color = prev.color;
        snap.zbroje[entry.short] = entry;
        saveZlomSnapshot(snap);
        registerHighlight(client, entry);
    };

    const persistTarcza = () => {
        if (!ctx || ctx.kind !== "tarcza" || !ctx.short) return;
        const entry: ShieldEntry = {
            short: ctx.short,
            klute: ctx.klute ?? 0,
            obuch: ctx.obuch ?? 0,
            ciete: ctx.ciete ?? 0,
            magik: ctx.magik ?? 0,
            opis: ctx.opis ?? "",
            waga: ctx.waga ?? 0,
            obj: ctx.obj ?? 0,
            cena: ctx.cena ?? 0,
            parowanie: ctx.parowanie ?? 0,
            oslona: ctx.oslona ?? "",
            roomId: roomId(),
        };
        const prev = snap.tarcze[entry.short];
        if (prev?.color) entry.color = prev.color;
        snap.tarcze[entry.short] = entry;
        saveZlomSnapshot(snap);
        registerHighlight(client, entry);
    };

    client.Triggers.registerTrigger(
        /^Oceniasz starannie (.+)\.$/,
        (line) => {
            ctx = { awaitingOpis: true };
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

    eventBus.on("zlom.snapshotReplaced", () => {
        snap = loadZlomSnapshot();
        reinstallHighlights(client, snap);
    });

    if (aliases) {
        aliases.push({
            pattern: /^\/zlom(?:\s+(bronie|tarcze|zbroje))?$/,
            callback: (m: RegExpMatchArray) => {
                snap = loadZlomSnapshot();
                const kind = m[1] ?? "bronie";
                const entries: (WeaponEntry | ShieldEntry | ArmorEntry)[] = Object.values(
                    (snap as any)[kind] ?? {},
                );
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
            callback: () => eventBus.emit("zlom.popup.open"),
        });

        aliases.push({
            pattern: /^\/zlom-reset$/,
            callback: () => {
                clearZlomData();
                client.println("Baza zlomu wyczyszczona.");
            },
        });
    }
}
