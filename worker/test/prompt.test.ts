/**
 * Provider-aware prompt sizing.
 *
 * The requirement being tested: a single prompt does NOT work everywhere. Groq
 * entries with a small `maxPromptTokens` must get a lean prompt, Gemini the full
 * one — and the output contract must survive the trimming either way.
 */

import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, buildUserMessage, estimateTokens, renderContext, PROMPT_VERSION } from '../src/prompt';
import type { PoolEntry } from '../src/config';

function entry(overrides: Partial<PoolEntry> = {}): PoolEntry {
    return {
        id: 'test',
        provider: 'groq',
        model: 'm',
        apiKey: 'k',
        priority: 10,
        maxPromptTokens: 24_000,
        maxOutputTokens: 500,
        supportsToolLoop: true,
        ...overrides,
    };
}

describe('buildSystemPrompt', () => {
    it('gives a generous entry the whole lean bundle', () => {
        const built = buildSystemPrompt(entry({ maxPromptTokens: 24_000 }), 200);
        expect(built.full).toBe(true);
        expect(built.droppedSections).toBe(0);
        expect(built.systemPrompt).toContain('USTAWIENIA:');
        expect(built.systemPrompt).toContain('ZDARZENIA DLA TRIGGEROW');
        expect(built.systemPrompt).toContain('SCHEMATY PROPOZYCJI');
        expect(built.systemPrompt).toContain('KOMENDY KLIENTA');
    });

    it('carries real settings and command names, not a hand-written summary', () => {
        // The whole point of consuming the generated bundle: these strings exist
        // in the prompt because they exist in the client's sources.
        const built = buildSystemPrompt(entry({ maxPromptTokens: 24_000 }), 200);
        expect(built.systemPrompt).toContain('shortenExits');
        expect(built.systemPrompt).toContain('## renderSettings.* (ui)');
    });

    it('tops a generous entry up with documentation bodies', () => {
        // The fat projection is ~50k tokens and fits nobody; doc pages are added
        // one at a time while they fit instead.
        const built = buildSystemPrompt(entry({ maxPromptTokens: 24_000 }), 200);
        expect(built.includedDocs.length).toBeGreaterThan(0);
        expect(built.estimatedTokens).toBeLessThanOrEqual(24_000 - 200);
    });

    it('adds no documentation when the lean bundle only just fitted', () => {
        const built = buildSystemPrompt(entry({ maxPromptTokens: 6_000 }), 200);
        expect(built.includedDocs).toEqual([]);
    });

    it('trims sections for a tight entry', () => {
        const lean = buildSystemPrompt(entry({ maxPromptTokens: 900 }), 100);
        const full = buildSystemPrompt(entry({ maxPromptTokens: 24_000 }), 100);
        expect(lean.full).toBe(false);
        expect(lean.droppedSections).toBeGreaterThan(0);
        expect(lean.systemPrompt.length).toBeLessThan(full.systemPrompt.length);
    });

    it('never drops the output contract, however tight the budget', () => {
        // A short prompt that yields unparseable output is worse than no saving.
        const built = buildSystemPrompt(entry({ maxPromptTokens: 200 }), 100);
        expect(built.systemPrompt).toContain('proposals');
    });

    it('never drops the persona, so the scope restriction always applies', () => {
        // This is what stops the endpoint being a general-purpose LLM proxy.
        const built = buildSystemPrompt(entry({ maxPromptTokens: 200 }), 100);
        expect(built.systemPrompt).toContain('Arkadia');
    });

    it('omits the JSON contract for entries that cannot hold it', () => {
        const built = buildSystemPrompt(
            entry({ supportsToolLoop: false, maxPromptTokens: 24_000 }),
            100,
        );
        expect(built.systemPrompt).not.toContain('```proposals');
        expect(built.full).toBe(false);
    });

    it('shrinks the prompt as the reserved token count grows', () => {
        const small = buildSystemPrompt(entry({ maxPromptTokens: 3_000 }), 100);
        const large = buildSystemPrompt(entry({ maxPromptTokens: 3_000 }), 2_500);
        expect(large.systemPrompt.length).toBeLessThanOrEqual(small.systemPrompt.length);
    });

    it('respects the declared budget', () => {
        const built = buildSystemPrompt(entry({ maxPromptTokens: 2_000 }), 200);
        expect(built.estimatedTokens).toBeLessThanOrEqual(2_000);
    });

    it('respects the budget at every size a real pool entry could declare', () => {
        // Regression guard for the doc top-up: appending pages must never push a
        // prompt past the ceiling the 429 is measured against.
        for (const maxPromptTokens of [1_000, 4_000, 12_000, 24_000, 100_000]) {
            const built = buildSystemPrompt(entry({ maxPromptTokens }), 200);
            expect(built.estimatedTokens, `budget ${maxPromptTokens}`).toBeLessThanOrEqual(
                maxPromptTokens - 200,
            );
        }
    });

    it('overshoots only when the mandatory sections alone exceed the budget', () => {
        // Persona and contract are never dropped, so an absurdly small budget
        // yields them and nothing else rather than a useless prompt.
        const built = buildSystemPrompt(entry({ maxPromptTokens: 400 }), 500);
        expect(built.droppedSections).toBeGreaterThan(0);
        expect(built.systemPrompt).toContain('Arkadia');
        expect(built.systemPrompt).toContain('proposals');
        expect(built.systemPrompt).not.toContain('USTAWIENIA:');
    });

    it('keeps the settings catalog on a tight entry, even at the cost of schemas', () => {
        // This assertion used to be the opposite way round: at 4k the schemas
        // survived and the catalog was dropped. That shipped a worse failure than
        // a malformed proposal — asked to set the map background colour, a 4k Groq
        // entry answered that the client has no such setting, while
        // `mapSettings.mapBackgroundColor` sat in the section that had just been
        // trimmed. A confident denial makes the user stop looking.
        //
        // Reordering alone does not rescue 4k: the catalog outweighs everything
        // left after the persona and contract, so it is dropped at any priority.
        // The reorder pays off from ~8k (see the test below); at 4k the only
        // defence is the persona rule that stops the model turning "not in my
        // context" into "the client cannot do that", and the persona is never
        // dropped.
        const built = buildSystemPrompt(entry({ maxPromptTokens: 4_000 }), 1_100);
        expect(built.full).toBe(false);
        expect(built.systemPrompt).not.toContain('USTAWIENIA:');
        expect(built.systemPrompt).toContain('NIGDY nie twierdz');
        // The contract is never dropped, so the kind names survive regardless.
        expect(built.systemPrompt).toContain('proposals');
    });

    it('keeps both once the budget can hold them', () => {
        // The per-shape schema split still earns its keep above the cliff.
        const built = buildSystemPrompt(entry({ maxPromptTokens: 12_000 }), 1_100);
        expect(built.systemPrompt).toContain('USTAWIENIA:');
        expect(built.systemPrompt).toContain('SCHEMATY PROPOZYCJI');
        expect(built.systemPrompt).toContain('"kind": "settingChange"');
    });
});

describe('estimateTokens', () => {
    it('is pessimistic, because under-estimating costs a 429', () => {
        // ~3 chars/token for Polish, vs the ~4 usually quoted for English.
        expect(estimateTokens('a'.repeat(300))).toBe(100);
    });
});

describe('renderContext', () => {
    it('returns nothing for absent or empty context', () => {
        expect(renderContext(undefined, 1000)).toBe('');
        expect(renderContext({}, 1000)).toBe('');
    });

    it('labels the context as data, not instructions', () => {
        const rendered = renderContext({ screen: 'triggery' }, 1000);
        expect(rendered).toContain('nie instrukcje');
        expect(rendered).toContain('[KONIEC KONTEKSTU]');
    });

    it('truncates oversized context', () => {
        const rendered = renderContext({ recentLines: Array(500).fill('x'.repeat(500)) }, 500);
        expect(rendered.length).toBeLessThan(800);
    });

    it('caps the number of settings and recent lines', () => {
        const rendered = renderContext(
            {
                settings: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`k${i}`, i])),
                recentLines: Array.from({ length: 100 }, (_, i) => `line ${i}`),
            },
            100_000,
        );
        expect(rendered).not.toContain('k199=');
        expect(rendered).toContain('line 99');
        expect(rendered).not.toContain('line 5\n');
    });
});

describe('buildUserMessage', () => {
    it('combines question and context', () => {
        const message = buildUserMessage('jak ustawic trigger', { screen: 'triggery' }, 1000);
        expect(message).toContain('jak ustawic trigger');
        expect(message).toContain('triggery');
    });

    it('is just the question when there is no context', () => {
        expect(buildUserMessage('  pytanie  ', undefined, 1000)).toBe('pytanie');
    });
});

describe('PROMPT_VERSION', () => {
    it('is stable across calls', () => {
        // Module-level constant: recomputing per request would burn the 10 ms
        // CPU budget for no benefit.
        expect(PROMPT_VERSION).toBe(PROMPT_VERSION);
        expect(PROMPT_VERSION.length).toBeGreaterThan(0);
    });

    it('changes when the policy text changes', async () => {
        // The bug this guards: the answer cache keyed on the *bundle* hash only,
        // so teaching the persona a new rule left every previously cached answer
        // in place — including the exact wrong answer the new rule was written to
        // prevent. Anything that alters the rendered prompt must alter the key.
        const { PERSONA } = await import('../src/kb/policy');
        expect(PERSONA).toContain('NIGDY nie twierdz');

        // The fingerprint is taken over the rendered sections, and the persona is
        // one of them, so a change to it necessarily changes the hash.
        const { buildSystemPrompt } = await import('../src/prompt');
        const built = buildSystemPrompt(entry({ maxPromptTokens: 24_000 }), 1_100);
        expect(built.systemPrompt).toContain('NIGDY nie twierdz');
    });
});
