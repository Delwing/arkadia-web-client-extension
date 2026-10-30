import { describe, expect, it } from 'vitest';
import { canonicalize, hashRecord } from '../src/records';

const AXE = {
    short: 'krasnoludzki asymetryczny topor bojowy',
    shortAlt: 'krasnoludzki asymetryczny topor bojowy',
    typ: 'topory',
    rodzaj: 'topor',
    klute: 0,
    obuch: 0,
    ciete: 1,
    chwyt: 'jednoreczny',
    magik: 0,
    srebro: 0,
    opis: 'Ciezki topor o asymetrycznym ostrzu.',
    waga: 4200,
    obj: 3500,
    cena: 1200,
    wywazenie: 7,
    parowanie: 5,
    roomId: 1234,
    color: '#ff0000',
    note: 'moja notatka',
};

describe('canonicalize', () => {
    it('drops what is personal to a player, and what depends on their skill', () => {
        const result = canonicalize('bron', AXE);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(Object.keys(result.record.payload)).toEqual([
            'short', 'typ', 'rodzaj', 'klute', 'obuch', 'ciete', 'chwyt', 'magik', 'srebro', 'opis',
        ]);
        expect(result.record.key).toBe(AXE.short);
    });

    it('keeps the i line and the evaluated name out of the item', () => {
        const result = canonicalize('zbroja', {
            short: 'lekka kolczuga', shortAlt: 'lekka kolczuge', typ: 'lekka', klute: 3, obuch: 2, ciete: 4, magik: 0,
            opis: 'Kolczuga.', waga: 8000, obj: 6000, cena: 300, oslona: 'korpus', iLine: '/kolczug/',
        });
        expect(result.ok && result.record.payload).not.toHaveProperty('iLine');
        expect(result.ok && result.record.payload).not.toHaveProperty('shortAlt');
    });

    it('takes an i line as a record of its own, for armour and shields only', () => {
        const line = canonicalize('iline', { item: 'zbroja', short: 'Lekka kolczuga', iLine: '/kolczug/' });
        expect(line.ok && line.record.key).toBe('zbroja:lekka kolczuga');
        expect(canonicalize('iline', { item: 'bron', short: 'miecz', iLine: 'x' })).toEqual({ ok: false, reason: 'item unknown' });
        const alt = canonicalize('altname', { item: 'bron', short: 'dlugi miecz', shortAlt: 'dlugi miecz' });
        expect(alt.ok && alt.record.key).toBe('bron:dlugi miecz');
    });

    it('rejects text that did not come from the game', () => {
        expect(canonicalize('bron', { ...AXE, opis: 'Topór' })).toEqual({ ok: false, reason: 'opis not ascii' });
    });

    it('rejects out-of-range numbers', () => {
        expect(canonicalize('bron', { ...AXE, magik: 2 }).ok).toBe(false);
        expect(canonicalize('bron', { ...AXE, klute: 0.5 }).ok).toBe(false);
    });

    it('rejects a record with no key', () => {
        expect(canonicalize('odmiana', { mianownik: ' ', dopelniacz: 'a', celownik: 'a', biernik: 'a', narzednik: 'a', miejscownik: 'a' }).ok).toBe(false);
    });

    it('keys an item by its name, in lower case', () => {
        const result = canonicalize('bron', { ...AXE, short: 'Krasnoludzki asymetryczny topor bojowy' });
        expect(result.ok && result.record.key).toBe('krasnoludzki asymetryczny topor bojowy');
    });

    it('leaves the description out of the hash, as one item words it differently copy to copy', async () => {
        const empty = canonicalize('bron', { ...AXE, opis: 'Laska z czaszka, pomiedzy ktorej rogami pozostawiono miejsce na wprawienie klejnotu.' });
        const set = canonicalize('bron', { ...AXE, opis: 'Laska z czaszka, pomiedzy ktorej rogami wprawiono bardzo maly bezbarwny klejnot.' });
        const other = canonicalize('bron', { ...AXE, magik: 1 });
        if (!empty.ok || !set.ok || !other.ok) throw new Error('not canonical');
        expect(await hashRecord(empty.record)).toBe(await hashRecord(set.record));
        expect(await hashRecord(other.record)).not.toBe(await hashRecord(set.record));
        // Still carried, as a sample
        expect(set.record.payload.opis).toContain('wprawiono');
    });

    it('omits an empty optional field rather than hashing it', async () => {
        const a = canonicalize('bron', { ...AXE, shortAlt: '' });
        const b = canonicalize('bron', { ...AXE, shortAlt: undefined });
        expect(a.ok && b.ok).toBe(true);
        if (!a.ok || !b.ok) return;
        expect(await hashRecord(a.record)).toBe(await hashRecord(b.record));
    });
});

describe('hashRecord', () => {
    // Pinned in the client's suite too (test/modules/crowd/crowdRecords.test.ts).
    // If this changes, every record already in D1 stops matching what clients
    // ask about, and both copies of records.ts must move together.
    it('matches the hash the client computes', async () => {
        const result = canonicalize('odmiana', {
            mianownik: 'zamkniety skorzany plecak',
            dopelniacz: 'zamknietego skorzanego plecaka',
            celownik: 'zamknietemu skorzanemu plecakowi',
            biernik: 'zamkniety skorzany plecak',
            narzednik: 'zamknietym skorzanym plecakiem',
            miejscownik: 'zamknietym skorzanym plecaku',
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(await hashRecord(result.record)).toBe(PINNED_ODMIANA_HASH);
    });
});

const PINNED_ODMIANA_HASH = 'ca2745c43c704b61a70c238dd3b0e00a4705d3af2326e9fe2ebe8895ac52f236';
