import type Triggers from "../Triggers";
import type { Trigger, TriggerSubPattern } from "../Triggers";

export interface WaitForLineOptions {
    /** Give up after this many milliseconds */
    timeout?: number;
    /** Abort the wait */
    signal?: AbortSignal;
    /** Tag for the temporary triggers */
    tag?: string;
}

export interface WaitForLineResult {
    /** Index of the pattern that matched */
    index: number;
    match: RegExpMatchArray;
    /** Plain text of the matched line */
    line: string;
}

const abortReason = (signal: AbortSignal) => signal.reason ?? new DOMException('Aborted', 'AbortError');

/**
 * Resolves on the first game line matching one of the patterns, without
 * changing the line. The temporary triggers go as soon as the wait settles:
 * on a match, after `timeout` (rejects with an Error named TimeoutError), or
 * when `signal` aborts (rejects with its reason).
 */
export function waitForLine(
    triggers: Triggers,
    patterns: TriggerSubPattern | TriggerSubPattern[],
    options: WaitForLineOptions = {},
): Promise<WaitForLineResult> {
    const alternatives = Array.isArray(patterns) ? patterns : [patterns];
    const { timeout, signal, tag } = options;
    if (signal?.aborted) {
        return Promise.reject(abortReason(signal));
    }
    return new Promise((resolve, reject) => {
        const registered: Trigger[] = [];
        let timer: ReturnType<typeof setTimeout> | undefined;
        let settled = false;
        const onAbort = () => finish(() => reject(abortReason(signal!)));
        const finish = (settle: () => void) => {
            if (settled) return;
            settled = true;
            registered.forEach(t => triggers.removeTrigger(t));
            if (timer !== undefined) clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            settle();
        };
        alternatives.forEach((pattern, index) => {
            registered.push(triggers.registerTrigger(pattern, (line, match) => {
                finish(() => resolve({ index, match, line: line.text }));
                return line;
            }, tag));
        });
        if (timeout !== undefined) {
            timer = setTimeout(() => {
                const error = new Error(`No matching line within ${timeout} ms`);
                error.name = 'TimeoutError';
                finish(() => reject(error));
            }, timeout);
        }
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
