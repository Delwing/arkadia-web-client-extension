/**
 * The Worker's knowledge of the client — **generated, never hand-written.**
 *
 * ## Where it comes from
 *
 * `scripts/build-assistant-kb.ts` walks the client sources with the TypeScript
 * compiler API and emits `public/assistant-kb.json`: every setting, every client
 * command, every trigger event, the proposal schemas taken verbatim from the
 * real interfaces, and the user docs. This module imports that file directly, by
 * relative path, and renders it into prompt sections.
 *
 * ### Why a direct import rather than a copy
 *
 * A copied `worker/src/kb/bundle.json` is a second artefact that only stays
 * correct while somebody remembers to re-run the copy step, and this whole file
 * exists because the previous hand-written copy drifted. A relative import has
 * no such step: esbuild (both `wrangler dev` and `wrangler deploy`) inlines the
 * JSON at bundle time, so the deployed Worker always carries whatever
 * `public/assistant-kb.json` contained at build time, and Vitest resolves the
 * same path with no config. `src/shared/assistant/knowledgeBundle.ts` was
 * deliberately written dependency-free and DOM-free precisely so this import is
 * possible — it is the only client module the Worker touches.
 *
 * The cost is that the Worker cannot be built from a checkout of `worker/`
 * alone. That is the right trade: the Worker is not independently deployable
 * from a client it must agree with.
 *
 * ## kbVersion
 *
 * `KB_VERSION` is derived from the bundle's own content hash. It is part of the
 * answer cache key, so regenerating the bundle invalidates every cached answer
 * at once with no KV sweep (a sweep would burn the free tier's delete
 * allowance). Nothing is hand-bumped: editing a setting label in the client and
 * re-running the generator is enough.
 *
 * The client sends its own `kbVersion`. A mismatch is not an error — the
 * Worker's copy always wins for prompt-building — but it is reported back so the
 * client can tell the user their bundle is stale.
 *
 * ## Budget
 *
 * The fat projection is ~50k tokens and fits no provider in the pool (Gemini,
 * the most generous, allows 24k). The prompt is therefore built from the **lean**
 * projection (~10k), and full documentation bodies are appended only while they
 * fit the entry's own budget. See `../prompt.ts`.
 */

import bundleJson from '../../../public/assistant-kb.json';
import {
    PROPOSAL_KINDS,
    projectLean,
    type DocEntry,
    type KnowledgeBundle,
    type LeanKnowledgeBundle,
    type LeanProposalSchema,
    type LeanSchemaCatalog,
} from '../../../src/shared/assistant/knowledgeBundle';

export { OUTPUT_CONTRACT, PERSONA, REGEX_KB } from './policy';

/**
 * The generated bundle. The cast is needed because TypeScript infers a literal
 * type from the JSON; the generator is what guarantees the shape, and
 * `worker/test/kb.test.ts` asserts the parts this module relies on are present.
 */
export const KB_BUNDLE = bundleJson as unknown as KnowledgeBundle;

/** What the prompt is actually built from. */
export const KB_LEAN: LeanKnowledgeBundle = projectLean(KB_BUNDLE);

/**
 * Cache-busting version, derived from the bundle rather than declared.
 *
 * `bundle.version` is a truncated SHA-256 over the bundle content with
 * `generatedAt` excluded, so an unchanged tree keeps its cache key and any
 * content change produces a new one. `formatVersion` is folded in as well: a
 * bundle-shape bump changes how the prompt renders even when the facts are
 * identical, and cached answers from the old rendering should not survive it.
 */
export function deriveKbVersion(bundle: Pick<KnowledgeBundle, 'formatVersion' | 'version'>): string {
    return `${bundle.formatVersion}.${bundle.version}`;
}

export const KB_VERSION = deriveKbVersion(KB_BUNDLE);

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

/**
 * Rendered as plain lines rather than JSON.
 *
 * The bundle's index is already line-oriented (`key | label | P3 | bool |
 * false`), and re-serialising it as JSON would spend roughly a third more tokens
 * on punctuation the model does not need.
 */
function block(heading: string, lines: string[]): string {
    return `${heading}\n${lines.join('\n')}`;
}

/** The legend plus the settings catalog. One unit: the lines need the legend. */
export function renderSettings(lean: LeanKnowledgeBundle = KB_LEAN): string {
    return [
        block('JAK CZYTAC PONIZSZY INDEKS:', lean.index.format),
        block('PANELE USTAWIEN:', lean.index.panels),
        block('USTAWIENIA:', lean.index.settings),
    ].join('\n\n');
}

export function renderCommands(lean: LeanKnowledgeBundle = KB_LEAN): string {
    return block(
        'KOMENDY KLIENTA (wpisywane w linii komend; to nie sa komendy gry):',
        lean.index.commands,
    );
}

export function renderEvents(lean: LeanKnowledgeBundle = KB_LEAN): string {
    return block(
        'ZDARZENIA DLA TRIGGEROW ZDARZENIOWYCH (pole "event" - tylko te wartosci):',
        lean.index.events,
    );
}

export function renderDocIndex(lean: LeanKnowledgeBundle = KB_LEAN): string {
    return block(
        'DOKUMENTACJA UZYTKOWNIKA (spis stron i ich sekcji):',
        lean.index.docs.map(doc => `${doc.id} - ${doc.title}: ${doc.headings.join('; ')}`),
    );
}

/** A full documentation page, appended when the entry's budget allows it. */
export function renderDocBody(doc: DocEntry): string {
    return `DOKUMENT ${doc.id} (${doc.title}):\n${doc.content.trim()}`;
}

/**
 * Catalog key -> proposal `kind`, or null for a schema that is not a proposal in
 * its own right (`userMacro` only ever appears nested inside a trigger).
 */
function kindOf(name: string): string | null {
    return (PROPOSAL_KINDS as readonly string[]).includes(name) ? name : null;
}

function renderSchema(name: string, schema: LeanProposalSchema): string {
    const kind = kindOf(name);
    const lines: string[] = [
        kind ? `### ${schema.name} — "kind": "${kind}"` : `### ${schema.name} (tylko wewnatrz triggera)`,
        schema.description,
    ];
    if (schema.fields.length > 0) {
        lines.push('POLA:');
        for (const field of schema.fields) {
            const required = field.required ? 'wymagane' : 'opcjonalne';
            lines.push(`  ${field.name}: ${field.type} (${required})${field.note ? ` — ${field.note}` : ''}`);
        }
    }
    if (schema.examples.length > 0) {
        lines.push('PRZYKLADY:');
        for (const example of schema.examples) {
            lines.push(`  ${example.description}\n    ${JSON.stringify(example.value)}`);
        }
    }
    if (schema.rules.length > 0) {
        lines.push('ZASADY:');
        for (const rule of schema.rules) lines.push(`  - ${rule}`);
    }
    return lines.join('\n');
}

/**
 * The proposal schemas.
 *
 * Rendered without the verbatim TypeScript source (the lean projection already
 * dropped it): `fields` carries the same name/type/required information at a
 * fraction of the tokens, and the examples are what actually teach the shape.
 *
 * The example payloads are `kind`-less in the bundle, because the bundle
 * describes the client's own `UserAlias`/`UserTrigger`/… shapes. The `kind`
 * wrapper is added here, from the same constant the contract uses.
 */
export function renderSchemas(lean: LeanKnowledgeBundle = KB_LEAN): string {
    return renderSchemaSections(lean)
        .map(part => part.text)
        .join('\n\n');
}

export interface SchemaSection {
    /** Catalog keys rendered into this part. */
    keys: string[];
    text: string;
}

/**
 * The schemas as separately droppable parts.
 *
 * One block would be ~3,000 tokens — more than a tight Groq entry's entire
 * budget — so an all-or-nothing section costs such an entry every proposal shape
 * at once. Split, it keeps the ones that fit. `trigger` and `userMacro` are
 * deliberately one part: a trigger schema without the macro types it must
 * contain teaches an unusable shape.
 */
export function renderSchemaSections(lean: LeanKnowledgeBundle = KB_LEAN): SchemaSection[] {
    const catalog = lean.schemas as LeanSchemaCatalog & Record<string, LeanProposalSchema>;
    const grouped = [['settingChange'], ['trigger', 'userMacro'], ['alias'], ['bind']];
    const known = new Set(grouped.flat());
    // Anything the generator adds later still reaches the prompt, at the back.
    for (const name of Object.keys(catalog)) {
        if (!known.has(name)) grouped.push([name]);
    }

    return grouped
        .filter(keys => keys.every(key => catalog[key]))
        .map((keys, index) => ({
            keys,
            text: [
                index === 0
                    ? 'SCHEMATY PROPOZYCJI (dokladne ksztalty, ktore klient przyjmuje):'
                    : null,
                ...keys.map(key => renderSchema(key, catalog[key])),
            ]
                .filter((part): part is string => part !== null)
                .join('\n\n'),
        }));
}
