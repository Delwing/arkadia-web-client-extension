import { deflateSync } from "node:zlib";

/** Minimal sfnt font tables, enough for readFontFileInfo. */
export interface TestFontSpec {
    family: string;
    typographicFamily?: string;
    weight: number;
    italic?: boolean;
    /** [min, default, max] of a wght axis. */
    wght?: [number, number, number];
}

function utf16be(s: string): number[] {
    const out: number[] = [];
    for (const ch of s) {
        const c = ch.charCodeAt(0);
        out.push(c >> 8, c & 0xff);
    }
    return out;
}

function nameTable(spec: TestFontSpec): Uint8Array {
    const entries: [number, string][] = [[1, spec.family], [2, spec.italic ? 'Italic' : 'Regular']];
    if (spec.typographicFamily) entries.push([16, spec.typographicFamily]);
    const strings: number[] = [];
    const records: number[][] = [];
    for (const [id, value] of entries) {
        const bytes = utf16be(value);
        records.push([3, 1, 0x409, id, bytes.length, strings.length]);
        strings.push(...bytes);
    }
    const header = 6 + records.length * 12;
    const view = new DataView(new ArrayBuffer(header + strings.length));
    view.setUint16(0, 0);
    view.setUint16(2, records.length);
    view.setUint16(4, header);
    records.forEach((r, i) => r.forEach((v, j) => view.setUint16(6 + i * 12 + j * 2, v)));
    strings.forEach((b, i) => view.setUint8(header + i, b));
    return new Uint8Array(view.buffer);
}

function os2Table(spec: TestFontSpec): Uint8Array {
    const view = new DataView(new ArrayBuffer(96));
    view.setUint16(4, spec.weight);
    view.setUint16(62, (spec.italic ? 1 : 0) | (spec.weight >= 700 ? 0x20 : 0));
    return new Uint8Array(view.buffer);
}

function fvarTable(axis: [number, number, number]): Uint8Array {
    const view = new DataView(new ArrayBuffer(16 + 20));
    view.setUint16(0, 1);
    view.setUint16(4, 16);
    view.setUint16(8, 1);
    view.setUint16(10, 20);
    for (let i = 0; i < 4; i++) view.setUint8(16 + i, 'wght'.charCodeAt(i));
    view.setInt32(20, axis[0] * 65536);
    view.setInt32(24, axis[1] * 65536);
    view.setInt32(28, axis[2] * 65536);
    return new Uint8Array(view.buffer);
}

function tables(spec: TestFontSpec): [string, Uint8Array][] {
    const list: [string, Uint8Array][] = [['OS/2', os2Table(spec)], ['name', nameTable(spec)]];
    if (spec.wght) list.push(['fvar', fvarTable(spec.wght)]);
    return list;
}

function writeTag(view: DataView, offset: number, tag: string) {
    for (let i = 0; i < 4; i++) view.setUint8(offset + i, tag.charCodeAt(i));
}

const pad4 = (n: number) => (n + 3) & ~3;

export function buildTtf(spec: TestFontSpec): ArrayBuffer {
    const list = tables(spec);
    let offset = 12 + list.length * 16;
    const size = list.reduce((sum, [, t]) => sum + pad4(t.length), offset);
    const buf = new Uint8Array(size);
    const view = new DataView(buf.buffer);
    view.setUint32(0, 0x00010000);
    view.setUint16(4, list.length);
    list.forEach(([tag, data], i) => {
        const rec = 12 + i * 16;
        writeTag(view, rec, tag);
        view.setUint32(rec + 8, offset);
        view.setUint32(rec + 12, data.length);
        buf.set(data, offset);
        offset += pad4(data.length);
    });
    return buf.buffer;
}

export function buildWoff(spec: TestFontSpec): ArrayBuffer {
    const list = tables(spec).map(([tag, data]) => {
        const compressed = new Uint8Array(deflateSync(data));
        return { tag, data, stored: compressed.length < data.length ? compressed : data };
    });
    let offset = 44 + list.length * 20;
    const size = list.reduce((sum, t) => sum + pad4(t.stored.length), offset);
    const buf = new Uint8Array(size);
    const view = new DataView(buf.buffer);
    writeTag(view, 0, 'wOFF');
    view.setUint32(4, 0x00010000);
    view.setUint32(8, size);
    view.setUint16(12, list.length);
    list.forEach((t, i) => {
        const rec = 44 + i * 20;
        writeTag(view, rec, t.tag);
        view.setUint32(rec + 4, offset);
        view.setUint32(rec + 8, t.stored.length);
        view.setUint32(rec + 12, t.data.length);
        buf.set(t.stored, offset);
        offset += pad4(t.stored.length);
    });
    return buf.buffer;
}
