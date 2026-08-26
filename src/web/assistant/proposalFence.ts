/**
 * Streaming prose/proposal splitter for the BYOK path.
 *
 * The shared Worker does this server-side (`worker/src/proposals.ts`) and the
 * client only ever sees clean `delta` / `proposals` frames. When the user brings
 * their own key we talk to the provider directly, so the same split has to
 * happen here — same output contract, same markers, so a question answered
 * through either path behaves identically.
 *
 * The withholding trick is the reason this is a class rather than a regex over
 * the finished text: a delta can split the fence marker anywhere ("``",
 * "`propos"), and forwarding eagerly would flash a partial fence on screen. We
 * hold back the most that could still be a partial marker and release it once
 * the next delta proves it innocent.
 */

const MARKER = '```proposals';
/** Weaker models emit a bare ```json block instead. */
const ALT_MARKERS = ['```json', '```JSON'];
const ALL_MARKERS = [MARKER, ...ALT_MARKERS];
const MAX_MARKER = Math.max(...ALL_MARKERS.map(m => m.length));

export interface FenceResult {
    prose: string;
    /** Raw parsed JSON array; validation happens downstream. */
    proposals: unknown[];
}

export class ProposalFenceExtractor {
    private pending = '';
    private captured = '';
    private inBlock = false;
    private emittedProse = '';

    /** Feed a delta; returns the prose that is now safe to render. */
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

        const holdback = this.holdbackLength(this.pending);
        if (holdback >= this.pending.length) return '';
        const safe = this.pending.slice(0, this.pending.length - holdback);
        this.pending = this.pending.slice(this.pending.length - holdback);
        this.emittedProse += safe;
        return safe;
    }

    /** Flush the tail and parse whatever was captured. */
    finish(): FenceResult {
        if (!this.inBlock && this.pending) {
            this.emittedProse += this.pending;
            this.pending = '';
        }
        return {
            prose: this.emittedProse.trim(),
            proposals: parseFencedJson(this.captured),
        };
    }

    private findMarker(text: string): number {
        let best = -1;
        for (const marker of ALL_MARKERS) {
            const index = text.indexOf(marker);
            if (index !== -1 && (best === -1 || index < best)) best = index;
        }
        return best;
    }

    /** Longest suffix of `text` that is a prefix of any marker. */
    private holdbackLength(text: string): number {
        const max = Math.min(MAX_MARKER - 1, text.length);
        for (let length = max; length > 0; length--) {
            const suffix = text.slice(text.length - length);
            if (ALL_MARKERS.some(marker => marker.startsWith(suffix))) return length;
        }
        return 0;
    }
}

/**
 * Pull the JSON array out of a captured fenced block. Returns `[]` for anything
 * unparseable — a malformed block costs the user their proposal cards, never an
 * exception, and never anything resembling evaluation.
 */
export function parseFencedJson(captured: string): unknown[] {
    if (!captured) return [];
    const withoutOpen = captured.replace(/^```[A-Za-z]*\s*/, '');
    const end = withoutOpen.indexOf('```');
    const body = (end === -1 ? withoutOpen : withoutOpen.slice(0, end)).trim();
    if (!body) return [];
    try {
        const parsed: unknown = JSON.parse(body);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === 'object') {
            const wrapped = (parsed as Record<string, unknown>).proposals;
            if (Array.isArray(wrapped)) return wrapped;
            return [parsed];
        }
        return [];
    } catch {
        return [];
    }
}
