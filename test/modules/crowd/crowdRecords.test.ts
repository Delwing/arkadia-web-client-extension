import { canonicalize, hashRecord } from '@modules/crowd/crowdRecords';

// Pinned in crowd-worker/test/records.test.ts too. If this changes, every
// record already in D1 stops matching what clients ask about.
const PINNED_ODMIANA_HASH = 'ca2745c43c704b61a70c238dd3b0e00a4705d3af2326e9fe2ebe8895ac52f236';

test('hashes a record exactly as the Worker does', async () => {
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

test('is the same code as the Worker copy', async () => {
    const { readFileSync } = await import('node:fs');
    const body = (path: string) => {
        const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
        return text.slice(text.indexOf('export type CrowdKind'));
    };
    expect(body('src/modules/crowd/crowdRecords.ts')).toBe(body('crowd-worker/src/records.ts'));
});
