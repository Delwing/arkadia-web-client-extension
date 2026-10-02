/**
 * Reads what a font file says about itself: family name, weight, italic, and
 * the weight range of a variable font. TTF/OTF (and the first face of a
 * TTC) are read directly, WOFF after inflating the few tables needed. WOFF2
 * tables are Brotli-compressed, so for those - and for anything unreadable -
 * the file name is the only source.
 */

export type FontFileFormat = 'truetype' | 'opentype' | 'collection' | 'woff' | 'woff2';

export interface FontFileInfo {
    family: string;
    /** usWeightClass, or the default of the weight axis for a variable font. */
    weight: number;
    /** Set for a variable font with a weight axis. */
    weightRange?: [number, number];
    italic: boolean;
    format: FontFileFormat;
    /** False when the values were guessed from the file name. */
    fromFile: boolean;
}

const FONT_EXTENSIONS = /\.(ttf|otf|ttc|woff2?)$/i;

export function isFontFileName(name: string): boolean {
    return FONT_EXTENSIONS.test(name);
}

function tag(view: DataView, offset: number): string {
    return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}

function formatOf(view: DataView): FontFileFormat | undefined {
    if (view.byteLength < 12) return undefined;
    const sig = tag(view, 0);
    if (sig === 'wOFF') return 'woff';
    if (sig === 'wOF2') return 'woff2';
    if (sig === 'OTTO') return 'opentype';
    if (sig === 'ttcf') return 'collection';
    if (sig === 'true' || view.getUint32(0) === 0x00010000) return 'truetype';
    return undefined;
}

type TableReader = (name: string) => Promise<DataView | undefined>;

function sfntTables(view: DataView, base: number): TableReader {
    const numTables = view.getUint16(base + 4);
    const tables = new Map<string, { offset: number; length: number }>();
    for (let i = 0; i < numTables; i++) {
        const rec = base + 12 + i * 16;
        tables.set(tag(view, rec), { offset: view.getUint32(rec + 8), length: view.getUint32(rec + 12) });
    }
    return async (name) => {
        const t = tables.get(name);
        if (!t || t.offset + t.length > view.byteLength) return undefined;
        return new DataView(view.buffer, view.byteOffset + t.offset, t.length);
    };
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
    const stream = new Response(bytes as BodyInit).body!.pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

function woffTables(view: DataView): TableReader {
    const numTables = view.getUint16(12);
    const tables = new Map<string, { offset: number; compLength: number; origLength: number }>();
    for (let i = 0; i < numTables; i++) {
        const rec = 44 + i * 20;
        tables.set(tag(view, rec), {
            offset: view.getUint32(rec + 4),
            compLength: view.getUint32(rec + 8),
            origLength: view.getUint32(rec + 12),
        });
    }
    return async (name) => {
        const t = tables.get(name);
        if (!t || t.offset + t.compLength > view.byteLength) return undefined;
        const raw = new Uint8Array(view.buffer, view.byteOffset + t.offset, t.compLength);
        if (t.compLength >= t.origLength) return new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
        const out = await inflate(raw);
        return new DataView(out.buffer, out.byteOffset, out.byteLength);
    };
}

function decodeUtf16be(view: DataView, offset: number, length: number): string {
    let s = '';
    for (let i = 0; i + 1 < length; i += 2) s += String.fromCharCode(view.getUint16(offset + i));
    return s;
}

function decodeLatin(view: DataView, offset: number, length: number): string {
    let s = '';
    for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
    return s;
}

/** A name-table entry, preferring Windows English, then any Windows, Unicode, Mac. */
export function readName(name: DataView, nameId: number): string | undefined {
    if (name.byteLength < 6) return undefined;
    const count = name.getUint16(2);
    const stringOffset = name.getUint16(4);
    let best: { rank: number; value: string } | undefined;
    for (let i = 0; i < count; i++) {
        const rec = 6 + i * 12;
        if (rec + 12 > name.byteLength) break;
        if (name.getUint16(rec + 6) !== nameId) continue;
        const platform = name.getUint16(rec);
        const language = name.getUint16(rec + 4);
        const length = name.getUint16(rec + 8);
        const offset = stringOffset + name.getUint16(rec + 10);
        if (offset + length > name.byteLength) continue;
        let rank: number;
        let value: string;
        if (platform === 3) {
            rank = language === 0x409 ? 0 : 1;
            value = decodeUtf16be(name, offset, length);
        } else if (platform === 0) {
            rank = 2;
            value = decodeUtf16be(name, offset, length);
        } else if (platform === 1) {
            rank = 3;
            value = decodeLatin(name, offset, length);
        } else {
            continue;
        }
        value = value.trim();
        if (value && (!best || rank < best.rank)) best = { rank, value };
    }
    return best?.value;
}

function readWeightAxis(fvar: DataView): [number, number, number] | undefined {
    if (fvar.byteLength < 16) return undefined;
    const axesOffset = fvar.getUint16(4);
    const axisCount = fvar.getUint16(8);
    const axisSize = fvar.getUint16(10);
    for (let i = 0; i < axisCount; i++) {
        const rec = axesOffset + i * axisSize;
        if (rec + 16 > fvar.byteLength) break;
        if (tag(fvar, rec) !== 'wght') continue;
        const fixed = (o: number) => Math.round(fvar.getInt32(rec + o) / 65536);
        return [fixed(4), fixed(8), fixed(12)];
    }
    return undefined;
}

const WEIGHT_WORDS: [RegExp, number][] = [
    [/hairline|thin/, 100],
    [/extra-?light|ultra-?light/, 200],
    [/semi-?bold|demi-?bold/, 600],
    [/extra-?bold|ultra-?bold/, 800],
    [/black|heavy/, 900],
    [/light/, 300],
    [/medium/, 500],
    [/bold/, 700],
];

const STYLE_SUFFIX = /[-_ ](it|vf|var)$|[-_ ]?(regular|book|normal|roman|italic|oblique|hairline|thin|extra-?light|ultra-?light|light|medium|semi-?bold|demi-?bold|extra-?bold|ultra-?bold|bold|black|heavy|variable)$/i;
const AXES_SUFFIX = /\[[^\]]*\]$/;

/** Weight, italic and family guessed from a file name like "Iosevka-BoldItalic.ttf". */
export function guessFromFileName(fileName: string): Omit<FontFileInfo, 'format' | 'fromFile'> {
    const base = fileName.replace(/^.*[\\/]/, '').replace(FONT_EXTENSIONS, '');
    const lower = base.toLowerCase();
    let weight = 400;
    for (const [re, w] of WEIGHT_WORDS) {
        if (re.test(lower)) {
            weight = w;
            break;
        }
    }
    const italic = /italic|oblique/.test(lower) || /[-_ ]it$/.test(lower);
    let family = base.replace(AXES_SUFFIX, '');
    for (let prev = ''; prev !== family;) {
        prev = family;
        family = family.replace(STYLE_SUFFIX, '');
    }
    family = family.replace(/[-_]+/g, ' ').trim() || base;
    return { family, weight, italic };
}

function formatFromName(fileName: string): FontFileFormat {
    const ext = fileName.toLowerCase().split('.').pop();
    if (ext === 'woff2') return 'woff2';
    if (ext === 'woff') return 'woff';
    if (ext === 'otf') return 'opentype';
    if (ext === 'ttc') return 'collection';
    return 'truetype';
}

export async function readFontFileInfo(data: ArrayBuffer, fileName: string): Promise<FontFileInfo> {
    const guess = guessFromFileName(fileName);
    const view = new DataView(data);
    const format = formatOf(view);
    if (!format || format === 'woff2') {
        return { ...guess, format: format ?? formatFromName(fileName), fromFile: false };
    }
    try {
        const tables = format === 'woff'
            ? woffTables(view)
            : sfntTables(view, format === 'collection' ? view.getUint32(12) : 0);
        const [name, os2, head, fvar] = await Promise.all([tables('name'), tables('OS/2'), tables('head'), tables('fvar')]);
        const family = (name && (readName(name, 16) ?? readName(name, 1))) || guess.family;
        let weight = guess.weight;
        let italic = guess.italic;
        if (os2 && os2.byteLength >= 64) {
            weight = os2.getUint16(4) || weight;
            italic = (os2.getUint16(62) & 0x201) !== 0;
        } else if (head && head.byteLength >= 46) {
            const macStyle = head.getUint16(44);
            weight = macStyle & 1 ? 700 : 400;
            italic = (macStyle & 2) !== 0;
        }
        const axis = fvar ? readWeightAxis(fvar) : undefined;
        const info: FontFileInfo = { family, weight, italic, format, fromFile: true };
        if (axis && axis[0] < axis[2]) {
            info.weight = axis[1];
            info.weightRange = [axis[0], axis[2]];
        }
        return info;
    } catch {
        return { ...guess, format, fromFile: false };
    }
}
