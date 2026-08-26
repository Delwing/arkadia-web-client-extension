/**
 * A setting the generated bundle calls `complex` must be one the validator
 * refuses to change — and vice versa.
 *
 * This file exists because of a bug found in live use, not in review. Asked how
 * to reorder the footer status bars, the assistant answered correctly in prose
 * ("go to Interfejs -> Stopka") *and* offered a confirm card for
 * `uiSettings.barOrder` directly underneath it. Two independent classifications
 * of "can the assistant edit this?" had drifted apart:
 *
 *   assistant-kb.json      control: 'complex'      -> model is told: point at the panel
 *   settingsRegistry.ts    type:    'stringArray'  -> validator: sure, go ahead
 *
 * The bundle is generated from the client sources; the registry is hand-written.
 * Neither is wrong in isolation, and nothing connected them, so the card
 * contradicted the sentence printed next to it. `barOrder`, `alwaysVisibleBars`
 * and `enemyBindsEnabledSlots` were all in this state.
 *
 * The rule enforced here is the safe direction: **anything either source calls
 * complex is not assistant-editable.** A false "you must do this by hand" costs
 * the user one extra click. A false "I can do this for you" writes a structure
 * the model does not understand into a drag-and-drop editor's storage key.
 *
 * Sibling of `proposalSchemaAlignment.test.ts`, which pins the proposal *kinds*
 * the same way. Same failure mode, different axis.
 */

import { describe, expect, it } from 'vitest';
import bundleJson from '../../../public/assistant-kb.json';
import { settingProposalKey, type KnowledgeBundle } from '@shared/assistant/knowledgeBundle.ts';
import { lookupSetting, validateProposal } from '@modules/core/assistant/proposalValidator.ts';

const bundle = bundleJson as unknown as KnowledgeBundle;

/**
 * A value that is type-correct for most controls, so a rejection is attributable
 * to editability rather than to the value failing a range or enum check.
 */
function probeValueFor(type: string): unknown {
    if (type.includes('[]') || type.startsWith('Array')) return [];
    if (type.startsWith('Record')) return {};
    if (type === 'boolean') return true;
    if (type === 'number') return 1;
    return 'x';
}

describe('setting editability alignment', () => {
    const complexInBundle = bundle.settings.filter(s => s.control === 'complex');

    it('finds complex settings in the bundle at all', () => {
        // Guards against the filter silently matching nothing if `control` is
        // ever renamed — which would make every assertion below vacuous.
        expect(complexInBundle.length).toBeGreaterThan(0);
    });

    it.each(complexInBundle.map(s => [settingProposalKey(s), s.type] as const))(
        'refuses to edit %s, which the bundle marks complex',
        (key, type) => {
            const result = validateProposal({
                kind: 'settingChange',
                key,
                value: probeValueFor(type),
            });

            expect(result.ok).toBe(false);
            if (result.ok) return;
            // Any rejection stops the write, but only this code means "a human
            // must do this in the panel". Others would mean the key or value was
            // malformed, which would make this test pass for the wrong reason.
            expect(result.issues.map(i => i.code)).toContain('settingNotAssistantEditable');
        },
    );

    it('every complex bundle setting still resolves in the registry', () => {
        // A `complex` setting the registry has never heard of would be rejected
        // as unknown, which also blocks the write but tells the user the wrong
        // thing — and would hide a genuine gap in the registry.
        const unresolved = complexInBundle
            .map(s => settingProposalKey(s))
            .filter(key => !lookupSetting(key));

        expect(unresolved).toEqual([]);
    });
});
