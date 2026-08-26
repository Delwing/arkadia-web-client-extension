/**
 * The Worker's knowledge comes from the generated bundle — and stays tied to it.
 *
 * Two properties are being defended here, both of which were broken before the
 * Worker consumed `public/assistant-kb.json`:
 *
 * 1. `KB_VERSION` is derived from the bundle's content hash, so regenerating the
 *    bundle invalidates every cached answer. It used to be a hand-bumped date
 *    string, which meant editing the client's knowledge left stale Worker
 *    answers in KV forever.
 * 2. The prompt teaches the `kind` names and field names that
 *    `src/modules/core/assistant/proposalValidator.ts` actually accepts. The
 *    Worker cannot import that validator (it pulls in the client's browser-shaped
 *    dependency tree), so it goes through `PROPOSAL_KINDS`;
 *    `test/shared/assistant/proposalSchemaAlignment.test.ts` in the main project
 *    is what pins `PROPOSAL_KINDS` to the validator itself.
 */

import { describe, expect, it } from 'vitest';
import {
    KB_BUNDLE,
    KB_LEAN,
    KB_VERSION,
    deriveKbVersion,
    renderCommands,
    renderEvents,
    renderSchemaSections,
    renderSchemas,
    renderSettings,
} from '../src/kb';
import { OUTPUT_CONTRACT, PERSONA, REGEX_KB } from '../src/kb/policy';
import { cacheKey } from '../src/normalize';
import { PROPOSAL_KINDS } from '../../src/shared/assistant/knowledgeBundle';

describe('KB_VERSION', () => {
    it('is derived from the bundle content hash, not hand-written', () => {
        expect(KB_VERSION).toBe(deriveKbVersion(KB_BUNDLE));
        expect(KB_VERSION).toContain(KB_BUNDLE.version);
        // The generator emits a truncated SHA-256; a date string is what this
        // replaced, and would silently stop invalidating anything.
        expect(KB_BUNDLE.version).toMatch(/^[0-9a-f]{16}$/);
        expect(KB_VERSION).not.toMatch(/^\d{4}-\d{2}-\d{2}/);
    });

    it('changes whenever the bundle content changes', () => {
        const before = deriveKbVersion({ formatVersion: 1, version: 'aaaaaaaaaaaaaaaa' });
        const after = deriveKbVersion({ formatVersion: 1, version: 'bbbbbbbbbbbbbbbb' });
        expect(after).not.toBe(before);
    });

    it('changes when the bundle format changes, even at identical content', () => {
        // A format bump changes how the prompt renders; answers cached against
        // the old rendering must not survive it.
        expect(deriveKbVersion({ formatVersion: 2, version: 'aaaaaaaaaaaaaaaa' })).not.toBe(
            deriveKbVersion({ formatVersion: 1, version: 'aaaaaaaaaaaaaaaa' }),
        );
    });

    it('invalidates cached answers when the bundle is regenerated', async () => {
        // The property this whole change exists for: editing the client's
        // knowledge used to leave every cached Worker answer in place, because
        // the cache key was derived from a date string nobody remembered to bump.
        const question = 'jak ustawic trigger na zabicie';
        const regenerated = deriveKbVersion({
            formatVersion: KB_BUNDLE.formatVersion,
            version: 'ffffffffffffffff',
        });
        expect(regenerated).not.toBe(KB_VERSION);
        expect(await cacheKey(question, regenerated)).not.toBe(
            await cacheKey(question, KB_VERSION),
        );
    });
});

describe('the generated bundle', () => {
    it('carries the catalogs the prompt renders', () => {
        expect(KB_BUNDLE.settings.length).toBeGreaterThan(50);
        expect(KB_BUNDLE.commands.length).toBeGreaterThan(50);
        expect(KB_BUNDLE.events.length).toBeGreaterThan(5);
        expect(KB_BUNDLE.docs.length).toBeGreaterThan(5);
        expect(KB_LEAN.index.settings.length).toBeGreaterThan(50);
    });

    it('documents every proposal kind the client accepts', () => {
        for (const kind of PROPOSAL_KINDS) {
            expect(KB_LEAN.schemas, `schema for kind "${kind}"`).toHaveProperty(kind);
        }
    });
});

describe('rendered knowledge', () => {
    it('teaches setting keys in the form the validator resolves', () => {
        // `lookupSetting` keys are `<storageKey>.<field>`. The catalog's own
        // `path` carries a `character.`/`ui.` prefix that it rejects outright, so
        // the prompt must never show that form.
        const settings = renderSettings();
        expect(settings).toContain('## settings.* (character)');
        expect(settings).toContain('## renderSettings.* (ui)');
        expect(settings).not.toContain('## character.settings');
        expect(settings).not.toContain('## ui.renderSettings');
    });

    it('renders the settings/commands/events catalogs from the bundle', () => {
        expect(renderSettings()).toContain(KB_LEAN.index.settings[1]);
        expect(renderCommands()).toContain(KB_LEAN.index.commands[0]);
        expect(renderEvents()).toContain(KB_LEAN.index.events[0]);
    });

    it('labels each schema with the kind the client expects', () => {
        const schemas = renderSchemas();
        for (const kind of PROPOSAL_KINDS) {
            expect(schemas, `kind "${kind}"`).toContain(`"kind": "${kind}"`);
        }
        // A macro is only ever nested inside a trigger — it is not a kind.
        expect(schemas).toContain('tylko wewnatrz triggera');
    });

    it('splits the schemas so a tight budget keeps some of them', () => {
        const parts = renderSchemaSections();
        expect(parts.length).toBeGreaterThan(1);
        // The trigger schema must never be separated from the macro types it
        // has to contain.
        const triggerPart = parts.find(part => part.keys.includes('trigger'));
        expect(triggerPart?.keys).toContain('userMacro');
        // Every catalog entry reaches the prompt somewhere.
        expect(parts.flatMap(part => part.keys).sort()).toEqual(
            Object.keys(KB_LEAN.schemas).sort(),
        );
    });

    it('teaches the settingChange field name the validator reads', () => {
        // `SettingChangeProposal` reads `input.key`; the bundle used to call it
        // `path`, which produced proposals the client dropped on the floor.
        const schemas = renderSchemas();
        expect(schemas).toContain('key: string (wymagane)');
        expect(schemas).not.toMatch(/"path":\s*"/);
    });
});

describe('hand-written policy', () => {
    it('states the scope restriction that keeps this from being an open proxy', () => {
        expect(PERSONA).toContain('Arkadia');
        expect(PERSONA).toContain('WYLACZNIE po polsku');
    });

    it('offers exactly the kinds the client validator accepts', () => {
        for (const kind of PROPOSAL_KINDS) {
            expect(OUTPUT_CONTRACT, `kind "${kind}"`).toContain(`"kind": "${kind}"`);
        }
        // The pre-unification spellings must be gone: both parsed cleanly and
        // both were discarded by the client.
        expect(OUTPUT_CONTRACT).not.toContain('"kind": "settings"');
        expect(OUTPUT_CONTRACT).not.toContain('triggerType');
    });

    it('keeps the regex rules, which are a project constraint', () => {
        expect(REGEX_KB).toContain('ASCII');
    });

    it('stays hand-written: no generated catalog leaks into the policy strings', () => {
        for (const text of [PERSONA, OUTPUT_CONTRACT, REGEX_KB]) {
            expect(text).not.toContain('##');
            expect(text.length).toBeLessThan(2_000);
        }
    });
});
