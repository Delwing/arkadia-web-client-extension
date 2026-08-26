/**
 * The generated knowledge bundle must teach exactly the proposal shapes that
 * `proposalValidator` accepts.
 *
 * This file exists because three pieces of the assistant were built in parallel
 * and each invented its own names for the same concepts — `kind: 'settings'` vs
 * `settingChange`, `triggerType` vs `type`, `path` vs `key`, a settings key with
 * a `character.`/`ui.` prefix the registry has never heard of. Every one of those
 * produced a proposal that parsed cleanly, reached the user as a confirm card,
 * and was then dropped on the floor. A comment saying "keep these in sync" is
 * what failed the first time; this is the check that cannot be ignored.
 *
 * The chain it closes:
 *
 *   proposalValidator.ProposalKind   (authority — gates writes to storage)
 *     ^= PROPOSAL_KINDS              (shared constant, dependency-free)
 *          ^= assistant-kb.json      (what the model is taught)
 *          ^= worker/src/**          (asserted in worker/test/kb.test.ts, which
 *                                     imports the same shared constant)
 *
 * The Worker cannot import the validator — `@modules` drags in `@client` and a
 * browser-shaped dependency tree — so `PROPOSAL_KINDS` is the shared link, and
 * this file is what pins it to the validator itself.
 */

import { describe, expect, it } from 'vitest';
import bundleJson from '../../../public/assistant-kb.json';
import {
    PROPOSAL_KINDS,
    projectLean,
    settingProposalKey,
    type KnowledgeBundle,
    type ProposalKindName,
} from '@shared/assistant/knowledgeBundle.ts';
import {
    lookupSetting,
    validateProposal,
    type ProposalKind,
} from '@modules/core/assistant/proposalValidator.ts';
import { buildAssistantSystemPrompt } from '@web/assistant/buildAssistantPrompt.ts';

const bundle = bundleJson as unknown as KnowledgeBundle;

/**
 * The validator's own list, read back at runtime.
 *
 * `KNOWN_KINDS` is module-private, but an unknown kind is reported with the
 * accepted set attached as `suggestions` — so the list can be recovered without
 * touching the validator, which is deliberately left alone as the authority.
 */
function validatorKinds(): string[] {
    const result = validateProposal({ kind: '__definitely_not_a_kind__' });
    const issue = result.issues.find(i => i.code === 'unknownProposalKind');
    expect(issue, 'validator no longer reports unknownProposalKind').toBeDefined();
    return [...(issue!.suggestions ?? [])];
}

describe('PROPOSAL_KINDS tracks the validator', () => {
    it('lists exactly the kinds the validator accepts', () => {
        expect([...PROPOSAL_KINDS].sort()).toEqual(validatorKinds().sort());
    });

    it('is assignable to the validator union in both directions', () => {
        // Compile-time half of the same assertion: adding a kind to one side
        // without the other stops this file from type-checking.
        const asValidatorKinds: ProposalKind[] = [...PROPOSAL_KINDS];
        const asSharedKinds: ProposalKindName[] = asValidatorKinds;
        expect(asSharedKinds).toHaveLength(PROPOSAL_KINDS.length);
    });

    it('is accepted kind-by-kind, so no kind is merely declared', () => {
        for (const kind of PROPOSAL_KINDS) {
            const result = validateProposal({ kind });
            const unknownKind = result.issues.some(i => i.code === 'unknownProposalKind');
            expect(unknownKind, `validator rejects the kind "${kind}" outright`).toBe(false);
        }
    });
});

describe('the schema catalog', () => {
    it('documents every proposal kind', () => {
        for (const kind of PROPOSAL_KINDS) {
            expect(bundle.schemas, `schema for "${kind}"`).toHaveProperty(kind);
        }
    });

    it('keeps `userMacro` out of the kinds — a macro is never proposed alone', () => {
        expect(PROPOSAL_KINDS).not.toContain('userMacro' as ProposalKindName);
        expect(bundle.schemas.userMacro).toBeDefined();
    });

    it('survives the lean projection, which is what the Worker prompts with', () => {
        const lean = projectLean(bundle);
        expect(Object.keys(lean.schemas).sort()).toEqual(Object.keys(bundle.schemas).sort());
    });
});

describe('every worked example is a proposal the client would apply', () => {
    // This is the assertion that matters. The examples are what actually teach
    // the model the shape; an example the validator rejects is a lesson in how
    // to produce rejected proposals.
    for (const kind of PROPOSAL_KINDS) {
        const schema = (bundle.schemas as Record<string, (typeof bundle.schemas)['alias']>)[kind];
        schema.examples.forEach((example, index) => {
            it(`${kind}.examples[${index}] — ${example.description}`, () => {
                const result = validateProposal({ kind, ...(example.value as object) });
                expect(
                    result.ok,
                    `rejected: ${result.issues.map(i => `${i.code} @ ${i.path}`).join(', ')}`,
                ).toBe(true);
                expect(result.proposal?.kind).toBe(kind);
            });
        });
    }
});

describe('the BYOK prompt asks for the same shapes as the Worker', () => {
    // The client builds its own prompt when the user supplies an API key. It is
    // a separate assembly path, so it is a separate opportunity to drift — and
    // it drifted: it was still asking for `kind:"settings"` and `triggerType`.
    const { systemPrompt } = buildAssistantSystemPrompt(projectLean(bundle));

    it('offers exactly the kinds the validator accepts', () => {
        for (const kind of PROPOSAL_KINDS) {
            expect(systemPrompt, `kind "${kind}"`).toContain(`"kind": "${kind}"`);
        }
    });

    it('no longer teaches the pre-unification spellings', () => {
        expect(systemPrompt).not.toContain('"kind": "settings"');
        expect(systemPrompt).not.toContain('triggerType');
    });
});

describe('the settings catalog', () => {
    it('resolves every entry through the validator registry', () => {
        const unresolved = bundle.settings
            .map(entry => settingProposalKey(entry))
            .filter(key => lookupSetting(key).status !== 'found');
        expect(unresolved).toEqual([]);
    });

    it('does not resolve the catalog `path`, which is why it must not be taught', () => {
        // Guards the fix rather than the bug: if `path` ever becomes resolvable
        // this test should be deleted, not worked around.
        const sample = bundle.settings.find(entry => entry.scope === 'character');
        expect(sample).toBeDefined();
        expect(lookupSetting(sample!.path).status).toBe('unknown');
        expect(lookupSetting(settingProposalKey(sample!)).status).toBe('found');
    });

    it('teaches the resolvable form in the lean index the Worker prompts with', () => {
        const index = projectLean(bundle).index.settings;
        const groups = index.filter(line => line.startsWith('## '));
        expect(groups.length).toBeGreaterThan(1);
        for (const group of groups) {
            const storageKey = group.replace(/^## /, '').replace(/\.\*.*$/, '');
            expect(
                bundle.settings.some(entry => entry.storageKey === storageKey),
                `index group "${group}" names no known storage key`,
            ).toBe(true);
        }
    });
});
