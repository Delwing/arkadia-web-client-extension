/**
 * Streaming prose/proposal splitter.
 *
 * ## Why a fenced block rather than JSON mode
 *
 * The endpoint has to do two things at once: stream Polish prose to the user as
 * it arrives, and return machine-applicable proposals. Native structured output
 * (`response_format: json_schema`) gives the second and destroys the first —
 * the user watches a JSON string assemble itself character by character. It is
 * also the feature least uniformly supported across free-tier models.
 *
 * So the model writes prose, then a fenced ```proposals block. Prose streams
 * immediately; the fence and everything after it is captured, never shown.
 *
 * ## The withholding trick
 *
 * A delta can split the fence marker anywhere ("``", "`proposa", …). If we
 * forwarded text eagerly, a partial fence would flash on screen before we knew
 * what it was. So the extractor always holds back the last `MARKER.length - 1`
 * characters of un-emitted prose — the most that could be a partial marker —
 * and releases them once the next delta proves they were innocent.
 */

import { PROPOSAL_KINDS } from '../../src/shared/assistant/knowledgeBundle';
import type { Proposal } from './types';

const MARKER = '```proposals';
/** Also accept a bare ```json block, which weaker models emit instead. */
const ALT_MARKERS = ['```json', '```JSON'];

export interface ExtractionResult {
    prose: string;
    proposals: Proposal[];
}

export class ProposalExtractor {
    private pending = '';
    private captured = '';
    private inBlock = false;
    private emittedProse = '';

    /**
     * Feed a delta. Returns the prose that is now safe to send to the client
     * (possibly an empty string).
     */
    push(delta: string): string {
        if (this.inBlock) {
            this.captured += delta;
            return '';
        }

        this.pending += delta;
        const markerIndex = this.findMarker(this.pending);

        if (markerIndex !== -1) {
            const prose = this.pending.slice(0, markerIndex);
            this.captured = this.pending.slice(markerIndex);
            this.pending = '';
            this.inBlock = true;
            this.emittedProse += prose;
            return prose;
        }

        // Hold back anything that could still turn out to be a partial marker.
        const holdback = this.holdbackLength(this.pending);
        if (holdback >= this.pending.length) return '';
        const safe = this.pending.slice(0, this.pending.length - holdback);
        this.pending = this.pending.slice(this.pending.length - holdback);
        this.emittedProse += safe;
        return safe;
    }

    /** Flush the tail and parse whatever was captured. */
    finish(): ExtractionResult {
        // Anything still withheld was never a marker after all.
        if (!this.inBlock && this.pending) {
            this.emittedProse += this.pending;
            this.pending = '';
        }
        return {
            prose: this.emittedProse.trim(),
            proposals: parseProposals(this.captured),
        };
    }

    /** Prose withheld at finish time, so the caller can emit a final delta. */
    flushPending(): string {
        if (this.inBlock || !this.pending) return '';
        const rest = this.pending;
        this.pending = '';
        this.emittedProse += rest;
        return rest;
    }

    private findMarker(text: string): number {
        let best = -1;
        for (const marker of [MARKER, ...ALT_MARKERS]) {
            const index = text.indexOf(marker);
            if (index !== -1 && (best === -1 || index < best)) best = index;
        }
        return best;
    }

    /**
     * How many trailing characters could be the start of a marker.
     * Checks the longest marker prefix that the buffer currently ends with.
     */
    private holdbackLength(text: string): number {
        const longest = Math.max(MARKER.length, ...ALT_MARKERS.map(m => m.length));
        const max = Math.min(longest - 1, text.length);
        for (let length = max; length > 0; length--) {
            const tail = text.slice(text.length - length);
            for (const marker of [MARKER, ...ALT_MARKERS]) {
                if (marker.startsWith(tail)) return length;
            }
        }
        return 0;
    }
}

/**
 * Pull the JSON array out of a captured fenced block and validate it.
 *
 * Everything is best-effort: a malformed block means no proposals, never a
 * failed request. The prose has already reached the user by this point and is
 * usually useful on its own.
 */
export function parseProposals(captured: string): Proposal[] {
    if (!captured) return [];

    // Strip the opening fence (with whatever language tag) and the closing fence.
    let body = captured.replace(/^```[a-zA-Z]*\s*/, '');
    const closing = body.indexOf('```');
    if (closing !== -1) body = body.slice(0, closing);
    body = body.trim();
    if (!body) return [];

    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        // Models sometimes trail a comma or append a stray sentence. Retry with the
        // outermost bracketed region only.
        const start = body.indexOf('[');
        const end = body.lastIndexOf(']');
        if (start === -1 || end <= start) return [];
        try {
            parsed = JSON.parse(body.slice(start, end + 1));
        } catch {
            return [];
        }
    }

    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list
        .map(validateProposal)
        .filter((item): item is Proposal => item !== null)
        .slice(0, 5); // a single answer proposing more than this is a bad answer
}

/**
 * Validate one proposal.
 *
 * This is a coarse first pass, not the trust boundary — the client re-validates
 * every proposal against the real `UserAlias`/`UserTrigger`/keymap shapes in
 * `src/modules/core/assistant/proposalValidator.ts` before anything can be
 * applied. What this pass is for is dropping obvious junk before it is cached
 * and streamed, and making sure the field names on the wire are the ones that
 * validator reads: a `kind` or field it does not recognise means the user is
 * shown a card that can never be applied.
 *
 * `label` is mandatory because the client shows it on the confirmation button —
 * an unlabelled proposal would be an unexplained one-click change.
 */
function validateProposal(raw: unknown): Proposal | null {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Record<string, unknown>;
    const label = typeof item.label === 'string' ? item.label.slice(0, 120) : '';
    if (!label) return null;
    // The accepted set is the shared constant, not a list maintained here.
    if (!(PROPOSAL_KINDS as readonly string[]).includes(item.kind as string)) return null;

    switch (item.kind) {
        case 'settingChange': {
            if (typeof item.key !== 'string' || !item.key) return null;
            if (!('value' in item)) return null;
            return { kind: 'settingChange', key: item.key.slice(0, 80), value: item.value, label };
        }
        case 'alias': {
            if (typeof item.pattern !== 'string' || !item.pattern) return null;
            if (typeof item.command !== 'string' || !item.command) return null;
            if (!isSafePattern(item.pattern)) return null;
            return {
                kind: 'alias',
                pattern: item.pattern.slice(0, 400),
                command: item.command.slice(0, 400),
                label,
            };
        }
        case 'trigger': {
            const type = item.type === 'event' ? 'event' : 'pattern';
            if (type === 'pattern') {
                if (typeof item.pattern !== 'string' || !item.pattern) return null;
                if (!isSafePattern(item.pattern)) return null;
            } else if (typeof item.event !== 'string' || !item.event) {
                return null;
            }
            if (!Array.isArray(item.macros) || item.macros.length === 0) return null;
            return {
                kind: 'trigger',
                type,
                pattern: typeof item.pattern === 'string' ? item.pattern.slice(0, 400) : undefined,
                event: typeof item.event === 'string' ? item.event.slice(0, 80) : undefined,
                flags: typeof item.flags === 'string' ? item.flags.slice(0, 8) : undefined,
                macros: item.macros.slice(0, 10),
                label,
            };
        }
        case 'bind': {
            if (typeof item.key !== 'string' || !item.key) return null;
            if (typeof item.command !== 'string' || !item.command) return null;
            const proposal: Proposal = {
                kind: 'bind',
                key: item.key.slice(0, 20),
                command: item.command.slice(0, 400),
                label,
            };
            // Only `true` is carried: the client reads an absent modifier as
            // "must NOT be held", so forwarding `false` would be noise that
            // means the same thing.
            for (const modifier of ['ctrl', 'alt', 'shift'] as const) {
                if (item[modifier] === true) proposal[modifier] = true;
            }
            return proposal;
        }
        default:
            return null;
    }
}

/**
 * Reject patterns that are malformed, or that contain non-ASCII.
 *
 * The non-ASCII rule is a real project constraint, not stylistic: this codebase
 * requires ASCII-compatible regexes, and a pattern containing Polish diacritics
 * produces a trigger that silently never matches. Better to drop the proposal
 * than to hand the user a trigger that looks right and does nothing.
 */
function isSafePattern(pattern: string): boolean {
    if (pattern.length > 400) return false;
    // Codepoint check rather than a regex: expressing the ASCII range as a
    // character class means embedding control characters in this source file.
    for (let i = 0; i < pattern.length; i++) {
        if (pattern.charCodeAt(i) > 127) return false;
    }
    try {
        new RegExp(pattern);
        return true;
    } catch {
        return false;
    }
}
