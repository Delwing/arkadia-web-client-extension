import { ProposalFenceExtractor, parseFencedJson } from '@web/assistant/proposalFence';

function stream(chunks: string[]): { prose: string; proposals: unknown[] } {
    const extractor = new ProposalFenceExtractor();
    let prose = '';
    for (const chunk of chunks) prose += extractor.push(chunk);
    const finished = extractor.finish();
    // Whatever `push` emitted must be a prefix of the final prose.
    expect(finished.prose.startsWith(prose.trim().slice(0, 20))).toBe(true);
    return finished;
}

describe('ProposalFenceExtractor', () => {
    it('passes plain prose straight through', () => {
        const result = stream(['Otworz ', 'ustawienia ', 'i dodaj trigger.']);
        expect(result.prose).toBe('Otworz ustawienia i dodaj trigger.');
        expect(result.proposals).toEqual([]);
    });

    it('never emits a fence marker split across deltas', () => {
        const extractor = new ProposalFenceExtractor();
        const emitted = [
            extractor.push('Gotowe.\n\n``'),
            extractor.push('`proposals\n[{"kind":"alias"}]\n```'),
        ].join('');

        expect(emitted).not.toContain('`');
        expect(extractor.finish().proposals).toEqual([{ kind: 'alias' }]);
    });

    it('accepts the bare ```json block weaker models emit', () => {
        const result = stream(['Odpowiedz.\n\n```json\n[{"kind":"settings","key":"lowHpAlert","value":3}]\n```']);
        expect(result.prose).toBe('Odpowiedz.');
        expect(result.proposals).toEqual([{ kind: 'settings', key: 'lowHpAlert', value: 3 }]);
    });

    it('releases withheld text that turned out not to be a marker', () => {
        const result = stream(['Cena to 100`', ' zlota.']);
        expect(result.prose).toBe('Cena to 100` zlota.');
    });
});

describe('parseFencedJson', () => {
    it('returns an empty list for a malformed block rather than throwing', () => {
        expect(parseFencedJson('```proposals\n[{oops}\n```')).toEqual([]);
    });

    it('unwraps a { proposals: [...] } object', () => {
        expect(parseFencedJson('```json\n{"proposals":[{"kind":"alias"}]}\n```'))
            .toEqual([{ kind: 'alias' }]);
    });

    it('wraps a lone object into a list', () => {
        expect(parseFencedJson('```json\n{"kind":"alias"}\n```')).toEqual([{ kind: 'alias' }]);
    });
});
