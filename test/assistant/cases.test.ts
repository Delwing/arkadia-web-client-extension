/**
 * Integrity check for the assistant eval corpus.
 *
 * `cases.jsonl` is how we decide which free-tier models are usable, so its
 * expectations have to stay machine-checkable: every settings key must really
 * exist, every cited doc section must really be there, and every pattern
 * expectation must compile. Without this test the corpus silently rots as the
 * client changes and the eval starts scoring models against fiction.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lookupSetting } from '@modules/core/assistant/proposalValidator';

const REPO_ROOT = resolve(__dirname, '../..');

const EXPECTED_KINDS = ['answer', 'settingChange', 'alias', 'trigger', 'bind', 'clarify', 'refusal'] as const;

interface EvalCase {
    id: string;
    question: string;
    expect: {
        kind: (typeof EXPECTED_KINDS)[number];
        keyOrPattern?: string;
        mustMentionDoc?: string;
        expectedValue?: unknown;
        mustNotEmit?: string[];
    };
    notes: string;
}

const raw = readFileSync(resolve(REPO_ROOT, 'test/assistant/cases.jsonl'), 'utf8');
const lines = raw.split('\n').filter(l => l.trim() !== '');
const cases: EvalCase[] = lines.map((line, i) => {
    try {
        return JSON.parse(line) as EvalCase;
    } catch (e) {
        throw new Error(`cases.jsonl line ${i + 1} is not valid JSON: ${(e as Error).message}`);
    }
});

describe('assistant eval corpus', () => {
    it('has a usable number of cases', () => {
        expect(cases.length).toBeGreaterThanOrEqual(50);
    });

    it('has unique ids', () => {
        const ids = cases.map(c => c.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('covers every proposal kind plus knowledge and adversarial cases', () => {
        const kinds = new Set(cases.map(c => c.expect.kind));
        for (const kind of EXPECTED_KINDS) {
            expect(kinds, `missing cases of kind ${kind}`).toContain(kind);
        }
    });

    it.each(cases.map(c => [c.id, c] as const))('%s is well formed', (_id, testCase) => {
        expect(testCase.question.trim()).not.toBe('');
        expect(testCase.notes.trim()).not.toBe('');
        expect(EXPECTED_KINDS).toContain(testCase.expect.kind);
    });

    const settingCases = cases.filter(c => c.expect.kind === 'settingChange');

    it('names a real settings key in every settingChange case', () => {
        expect(settingCases.length).toBeGreaterThan(0);
        for (const testCase of settingCases) {
            const key = testCase.expect.keyOrPattern;
            expect(key, `${testCase.id} has no keyOrPattern`).toBeTypeOf('string');
            const lookup = lookupSetting(key!);
            expect(lookup.status, `${testCase.id}: key "${key}" does not resolve`).toBe('found');
            expect(lookup.status === 'found' && lookup.descriptor.key).toBe(key);
        }
    });

    const patternKinds = new Set(['alias', 'trigger', 'bind']);

    it('uses compilable regexes for alias/trigger/bind expectations', () => {
        for (const testCase of cases.filter(c => patternKinds.has(c.expect.kind))) {
            const source = testCase.expect.keyOrPattern;
            expect(source, `${testCase.id} has no keyOrPattern`).toBeTypeOf('string');
            expect(() => new RegExp(source!), `${testCase.id}: "${source}" does not compile`).not.toThrow();
        }
    });

    it('cites doc sections that actually exist', () => {
        const cited = cases
            .map(c => c.expect.mustMentionDoc)
            .filter((v): v is string => typeof v === 'string');
        expect(cited.length).toBeGreaterThan(10);

        const docCache = new Map<string, string>();
        for (const reference of cited) {
            const [file, heading] = reference.split('#');
            expect(heading, `"${reference}" is missing a #section`).toBeTruthy();
            if (!docCache.has(file)) {
                docCache.set(file, readFileSync(resolve(REPO_ROOT, file), 'utf8'));
            }
            const content = docCache.get(file)!;
            const found = content
                .split('\n')
                .some(line => /^#{1,3} /.test(line) && line.replace(/^#{1,3} /, '').trim() === heading);
            expect(found, `"${heading}" is not a heading in ${file}`).toBe(true);
        }
    });

    it('spells adversarial expectations with mustNotEmit where it matters', () => {
        const injections = cases.filter(c => c.id.startsWith('inj-'));
        expect(injections.length).toBeGreaterThanOrEqual(3);
        for (const testCase of injections) {
            expect(testCase.expect.kind).toBe('refusal');
            expect(testCase.expect.mustNotEmit, `${testCase.id} must list forbidden kinds`).toBeInstanceOf(Array);
        }
    });
});
