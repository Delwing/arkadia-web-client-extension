import { describe, expect, it } from 'vitest';
import { ProposalExtractor, parseProposals } from '../src/proposals';
import { PROPOSAL_KINDS } from '../../src/shared/assistant/knowledgeBundle';

/**
 * Feed a string through the extractor in chunks of `size`.
 *
 * `streamed` is exactly what the client would have received, chunk by chunk;
 * `prose` is the extractor's final view. Keeping them separate is the point —
 * the fence must never appear in what was actually sent, not merely be absent
 * from the tidied-up final string.
 */
function stream(text: string, size: number) {
    const extractor = new ProposalExtractor();
    let streamed = '';
    for (let i = 0; i < text.length; i += size) {
        streamed += extractor.push(text.slice(i, i + size));
    }
    streamed += extractor.flushPending();
    return { streamed, ...extractor.finish() };
}

const BLOCK = `\`\`\`proposals
[{"kind":"alias","pattern":"^zz (\\\\w+)$","command":"zabij $1","label":"Alias zz"}]
\`\`\``;

describe('ProposalExtractor', () => {
    it('streams prose and captures the trailing block', () => {
        const result = stream(`Odpowiedz po polsku.\n\n${BLOCK}`, 1000);
        expect(result.prose).toBe('Odpowiedz po polsku.');
        expect(result.proposals).toHaveLength(1);
    });

    it('never leaks the fence, whatever the chunk boundaries', () => {
        // The withholding logic exists precisely for this: a delta can split the
        // marker at any character.
        for (const size of [1, 2, 3, 5, 7, 11, 50]) {
            const result = stream(`Tekst odpowiedzi.\n\n${BLOCK}`, size);
            // Assert on what was actually streamed out, not on the tidied final view.
            expect(result.streamed, `chunk size ${size}`).not.toContain('`');
            expect(result.streamed, `chunk size ${size}`).not.toContain('proposals');
            expect(result.prose, `chunk size ${size}`).toBe('Tekst odpowiedzi.');
            expect(result.proposals, `chunk size ${size}`).toHaveLength(1);
        }
    });

    it('releases withheld text that turns out not to be a marker', () => {
        // Backticks in ordinary prose must survive.
        const result = stream('Uzyj komendy `zabij` w grze.', 3);
        expect(result.prose).toBe('Uzyj komendy `zabij` w grze.');
        expect(result.proposals).toEqual([]);
    });

    it('handles an answer with no proposals at all', () => {
        const result = stream('Sama odpowiedz bez propozycji.', 4);
        expect(result.prose).toBe('Sama odpowiedz bez propozycji.');
        expect(result.proposals).toEqual([]);
    });

    it('accepts a bare ```json fence, which weaker models emit', () => {
        const alt =
            '```json\n[{"kind":"settingChange","key":"settings.shortenExits","value":true,"label":"Skroc wyjscia"}]\n```';
        const result = stream(`Wlacz to ustawienie.\n\n${alt}`, 6);
        expect(result.prose).toBe('Wlacz to ustawienie.');
        expect(result.proposals).toHaveLength(1);
    });
});

describe('parseProposals validation', () => {
    it('accepts every kind the client validator accepts', () => {
        const parsed = parseProposals(`\`\`\`proposals
[
  {"kind":"settingChange","key":"settings.shortenExits","value":true,"label":"a"},
  {"kind":"alias","pattern":"zz","command":"zabij","label":"b"},
  {"kind":"trigger","type":"event","event":"kill","macros":[{"type":"beep"}],"label":"c"},
  {"kind":"bind","key":"KeyD","alt":true,"command":"dobadz bron","label":"d"}
]
\`\`\``);
        expect(parsed.map(p => p.kind)).toEqual([...PROPOSAL_KINDS]);
    });

    it('keeps the trigger discriminator under the name the validator reads', () => {
        // It used to be `triggerType`, which the client silently ignored — a
        // pattern trigger would have been stored for an event proposal.
        const [proposal] = parseProposals(
            '```proposals\n[{"kind":"trigger","type":"event","event":"kill","macros":[{"type":"beep"}],"label":"x"}]\n```',
        );
        expect(proposal).toMatchObject({ kind: 'trigger', type: 'event', event: 'kill' });
        expect(proposal).not.toHaveProperty('triggerType');
    });

    it('ignores the old `triggerType` spelling instead of honouring it', () => {
        // An event proposal written the old way must not quietly become a
        // pattern trigger with no pattern.
        const parsed = parseProposals(
            '```proposals\n[{"kind":"trigger","triggerType":"event","event":"kill","macros":[{"type":"beep"}],"label":"x"}]\n```',
        );
        expect(parsed).toEqual([]);
    });

    it('drops the pre-rename `settings` kind, which the client cannot apply', () => {
        const parsed = parseProposals(
            '```proposals\n[{"kind":"settings","key":"settings.shortenExits","value":true,"label":"x"}]\n```',
        );
        expect(parsed).toEqual([]);
    });

    it('carries a bind, including only the modifiers that must be held', () => {
        const [proposal] = parseProposals(
            '```proposals\n[{"kind":"bind","key":"Numpad5","ctrl":true,"shift":false,"command":"rozejrzyj sie","label":"x"}]\n```',
        );
        expect(proposal).toEqual({
            kind: 'bind',
            key: 'Numpad5',
            command: 'rozejrzyj sie',
            ctrl: true,
            label: 'x',
        });
    });

    it('drops a bind with no command, which would do nothing', () => {
        expect(
            parseProposals('```proposals\n[{"kind":"bind","key":"KeyD","label":"x"}]\n```'),
        ).toEqual([]);
    });

    it('drops proposals with no label, since the UI has nothing to show', () => {
        const parsed = parseProposals(
            '```proposals\n[{"kind":"alias","pattern":"^a$","command":"b"}]\n```',
        );
        expect(parsed).toEqual([]);
    });

    it('drops unknown kinds', () => {
        const parsed = parseProposals(
            '```proposals\n[{"kind":"exec","cmd":"rm -rf /","label":"x"}]\n```',
        );
        expect(parsed).toEqual([]);
    });

    it('rejects regexes containing Polish diacritics', () => {
        // Such a pattern compiles fine but silently never matches in the client.
        const parsed = parseProposals(
            '```proposals\n[{"kind":"alias","pattern":"^zabiję$","command":"x","label":"y"}]\n```',
        );
        expect(parsed).toEqual([]);
    });

    it('rejects a syntactically invalid regex', () => {
        const parsed = parseProposals(
            '```proposals\n[{"kind":"alias","pattern":"^([a-z","command":"x","label":"y"}]\n```',
        );
        expect(parsed).toEqual([]);
    });

    it('rejects a trigger with no macros', () => {
        const parsed = parseProposals(
            '```proposals\n[{"kind":"trigger","type":"event","event":"kill","macros":[],"label":"x"}]\n```',
        );
        expect(parsed).toEqual([]);
    });

    it('recovers from trailing prose after the JSON array', () => {
        const parsed = parseProposals(
            '```proposals\n[{"kind":"alias","pattern":"^a$","command":"b","label":"c"}]\nMam nadzieje ze pomoglem.\n```',
        );
        expect(parsed).toHaveLength(1);
    });

    it('returns nothing for malformed JSON rather than throwing', () => {
        expect(parseProposals('```proposals\n{not json\n```')).toEqual([]);
        expect(parseProposals('')).toEqual([]);
    });

    it('caps the number of proposals', () => {
        const many = Array.from({ length: 20 }, (_, i) => ({
            kind: 'settingChange',
            key: `k${i}`,
            value: i,
            label: `l${i}`,
        }));
        const parsed = parseProposals(`\`\`\`proposals\n${JSON.stringify(many)}\n\`\`\``);
        expect(parsed).toHaveLength(5);
    });
});
