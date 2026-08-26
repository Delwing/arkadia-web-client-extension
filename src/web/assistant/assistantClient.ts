/**
 * Transport for the in-client AI assistant.
 *
 * Two paths, one event shape:
 *
 * 1. **The shared Worker** (`worker/`, `POST /ask`). Default. Takes a question
 *    plus structured context — never a prompt — and streams SSE frames back.
 *    The owner's keys stay server-side.
 * 2. **BYOK.** The user's own key, called directly against an OpenAI-compatible
 *    endpoint. Used when they tick "uzywaj mojego klucza", and automatically as
 *    the fallback when the Worker answers `pool_exhausted` (every provider is
 *    cooling down) or cannot be reached at all.
 *
 * Everything the model proposes is run through `validateProposal` here, so the
 * panel never sees an unvalidated proposal. Nothing in this module writes to
 * storage; applying is `applyProposal.ts`, and only on an explicit click.
 */

import {
    validateProposal,
    type ValidationResult,
} from '@modules/core/assistant/proposalValidator.ts';
import { getDeviceId } from '@modules/firebase/firebaseTypes.ts';
import {
    getAssistantApiKey,
    getByokBaseUrl,
    getByokModel,
    getPreferByok,
    getWorkerUrl,
} from './assistantKeyStore';
import { getKbVersion, loadLeanBundle } from './knowledgeBundleClient';
import { ProposalFenceExtractor } from './proposalFence';
import { readSse, parseSseJson } from './sseStream';
import { buildAssistantSystemPrompt, buildUserMessage, type AssistantContext } from './buildAssistantPrompt';

/** Worker error statuses plus the two the client can produce on its own. */
export type AssistantErrorStatus =
    | 'pool_exhausted'
    | 'quota_exceeded'
    | 'challenge_required'
    | 'challenge_failed'
    | 'bad_request'
    | 'forbidden_origin'
    | 'too_large'
    | 'internal_error'
    | 'network_error'
    | 'not_configured';

export type AssistantSource = 'worker' | 'byok';

export interface AssistantQuota {
    used: number;
    limit: number;
    resetsAt: number;
}

export type AssistantEvent =
    | { type: 'meta'; cached: boolean; source: string; cacheTier?: string }
    | { type: 'delta'; text: string }
    /** Discard every delta received so far and start the answer over. */
    | { type: 'restart'; source: string }
    /**
     * `settingKeys[i]` is the settings key `results[i]` concerned, if any. Needed
     * for rejected proposals, where `results[i].proposal` is deliberately absent.
     */
    | { type: 'proposals'; results: ValidationResult[]; settingKeys: (string | undefined)[] }
    | { type: 'done'; via: AssistantSource; quota?: AssistantQuota }
    | { type: 'error'; status: AssistantErrorStatus; message: string; retryAfter?: number }
    /** Purely informational, e.g. "the pool is empty, switching to your key". */
    | { type: 'notice'; message: string };

export interface AskOptions {
    question: string;
    context?: AssistantContext;
    signal?: AbortSignal;
    onEvent: (event: AssistantEvent) => void;
}

/** Polish, ASCII-only copy for each terminal status. */
const STATUS_MESSAGES: Record<AssistantErrorStatus, string> = {
    pool_exhausted: 'Wspolna pula kluczy jest chwilowo wyczerpana. Sprobuj pozniej albo dodaj wlasny klucz API w ustawieniach panelu.',
    quota_exceeded: 'Wyczerpano dzienny limit pytan dla tego urzadzenia. Limit odnawia sie o polnocy UTC.',
    challenge_required: 'Serwer wymaga weryfikacji antybotowej, ktorej ten panel jeszcze nie obsluguje. Uzyj wlasnego klucza API.',
    challenge_failed: 'Weryfikacja antybotowa nie powiodla sie.',
    bad_request: 'Serwer odrzucil zapytanie.',
    forbidden_origin: 'Ten adres nie jest na liscie dozwolonych domen serwera asystenta.',
    too_large: 'Pytanie jest za dlugie. Skroc je i sprobuj ponownie.',
    internal_error: 'Blad po stronie serwera asystenta.',
    network_error: 'Nie udalo sie polaczyc z serwerem asystenta. Sprawdz adres w ustawieniach panelu.',
    not_configured: 'Asystent nie jest skonfigurowany: brak adresu serwera i brak wlasnego klucza API. Uzupelnij ustawienia panelu.',
};

/** How long the Worker may go without writing a frame before we give up. */
const IDLE_TIMEOUT_MS = 60_000;
const TIMEOUT_MESSAGE = 'Serwer asystenta nie odpowiada. Sprobuj ponownie za chwile.';

export function statusMessage(status: AssistantErrorStatus): string {
    return STATUS_MESSAGES[status] ?? STATUS_MESSAGES.internal_error;
}

/**
 * Bring a raw wire proposal to the shape `proposalValidator` expects.
 *
 * The validator is the authority on proposal shape and is not edited to suit
 * the wire. Both prompts now ask for its spelling — `kind:"settingChange"` and
 * `type` — so the renames below are no longer a translation between two live
 * contracts. They stay for two reasons that have not gone away: a deployed
 * Worker can be older than the client talking to it, and weak free-tier models
 * mix spellings regardless of what the contract says.
 *
 * `label` -> `reason` is different: it is a live difference, not legacy. The
 * wire carries `label` because the confirmation button needs a short caption,
 * and the validator carries `reason`. The validator would simply ignore an
 * unknown `label`, so it is folded across here rather than dropped.
 */
export function toValidatorInput(raw: unknown): unknown {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const input = { ...(raw as Record<string, unknown>) };

    if (input.kind === 'settings') input.kind = 'settingChange';
    if (input.triggerType !== undefined && input.type === undefined) {
        input.type = input.triggerType;
    }
    delete input.triggerType;
    if (typeof input.label === 'string' && input.reason === undefined) {
        input.reason = input.label;
    }
    delete input.label;
    return input;
}

/**
 * The settings key a proposal was about, whether or not it validated.
 *
 * `ValidationResult.proposal` is populated only on success, by design — a
 * present proposal means "safe to apply". But a proposal rejected as
 * `settingNotAssistantEditable` is not a failure the user should be shown as
 * one: the model identified the right setting and correctly could not change it
 * on their behalf. To offer "open that panel for me" the UI needs the key, so it
 * is carried alongside rather than by loosening that contract or by parsing it
 * back out of the Polish message.
 */
export function settingKeyOf(raw: unknown): string | undefined {
    const input = toValidatorInput(raw);
    if (!input || typeof input !== 'object') return undefined;
    const record = input as Record<string, unknown>;
    if (record.kind !== 'settingChange') return undefined;
    return typeof record.key === 'string' ? record.key : undefined;
}

function validateAll(raw: unknown): ValidationResult[] {
    if (!Array.isArray(raw)) return [];
    return raw.map(item => validateProposal(toValidatorInput(item)));
}

function settingKeys(raw: unknown): (string | undefined)[] {
    if (!Array.isArray(raw)) return [];
    return raw.map(settingKeyOf);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function askAssistant(options: AskOptions): Promise<void> {
    const { onEvent } = options;
    const apiKey = getAssistantApiKey();
    const workerUrl = getWorkerUrl();
    const preferByok = getPreferByok();

    if (preferByok && apiKey) {
        await askByok(options, apiKey);
        return;
    }

    if (!workerUrl) {
        if (apiKey) {
            await askByok(options, apiKey);
            return;
        }
        onEvent({ type: 'error', status: 'not_configured', message: statusMessage('not_configured') });
        return;
    }

    const outcome = await askWorker(options, workerUrl);
    if (outcome.ok) return;

    // The two statuses that mean "this path cannot answer right now, but another
    // one could". Everything else is terminal and was already reported.
    const canFallBack = outcome.status === 'pool_exhausted' || outcome.status === 'network_error';
    if (canFallBack && apiKey && !options.signal?.aborted) {
        onEvent({ type: 'notice', message: 'Wspolna pula jest niedostepna - pytam przez Twoj klucz API.' });
        await askByok(options, apiKey);
        return;
    }

    onEvent({
        type: 'error',
        status: outcome.status,
        message: outcome.message ?? statusMessage(outcome.status),
        retryAfter: outcome.retryAfter,
    });
}

// ---------------------------------------------------------------------------
// Worker path
// ---------------------------------------------------------------------------

interface WorkerOutcome {
    ok: boolean;
    status: AssistantErrorStatus;
    message?: string;
    retryAfter?: number;
}

/**
 * Errors are *returned*, not emitted, so `askAssistant` can decide whether the
 * BYOK fallback applies before anything is shown to the user.
 */
async function askWorker(options: AskOptions, workerUrl: string): Promise<WorkerOutcome> {
    const { question, context, signal, onEvent } = options;
    const kbVersion = await getKbVersion();

    /**
     * Watchdog. An upstream that accepts the connection and then never writes
     * leaves the panel on "Mysle..." forever — observed for real against a
     * locally running Worker. The caller's signal is forwarded into this one
     * rather than merged with `AbortSignal.any`, which is too new to rely on.
     */
    const watchdog = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            timedOut = true;
            watchdog.abort();
        }, IDLE_TIMEOUT_MS);
    };
    signal?.addEventListener('abort', () => watchdog.abort(), { once: true });
    bump();

    let response: Response;
    try {
        response = await fetch(`${workerUrl}/ask`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                question,
                kbVersion,
                deviceId: safeDeviceId(),
                ...(context ? { context } : {}),
            }),
            signal: watchdog.signal,
        });
    } catch (err) {
        clearTimeout(timer);
        if (timedOut) return { ok: false, status: 'network_error', message: TIMEOUT_MESSAGE };
        if (isAbort(err)) return { ok: true, status: 'internal_error' };
        return { ok: false, status: 'network_error' };
    }

    if (!response.ok || !response.body) {
        // Non-stream failures come back as a JSON body with the same `status`.
        const payload = await response.json().catch(() => null) as
            { status?: string; message?: string; retryAfter?: number } | null;
        return {
            ok: false,
            status: normalizeStatus(payload?.status),
            message: payload?.message,
            retryAfter: payload?.retryAfter,
        };
    }

    let failure: WorkerOutcome | null = null;
    /**
     * A 200 with an empty event stream is a real failure mode, not a theoretical
     * one: an upstream that dies before writing its first frame produces exactly
     * this. Without the counter the panel would show a blank turn and no reason.
     */
    let frames = 0;
    try {
        for await (const frame of readSse(response.body)) {
            const event = parseSseJson(frame.data) as Record<string, unknown> | null;
            bump();
            if (!event || typeof event.type !== 'string') continue;
            frames++;

            switch (event.type) {
                case 'meta':
                    onEvent({
                        type: 'meta',
                        cached: Boolean(event.cached),
                        source: String(event.source ?? ''),
                        cacheTier: typeof event.cacheTier === 'string' ? event.cacheTier : undefined,
                    });
                    break;
                case 'delta':
                    if (typeof event.text === 'string') onEvent({ type: 'delta', text: event.text });
                    break;
                case 'restart':
                    onEvent({ type: 'restart', source: String(event.source ?? '') });
                    break;
                case 'proposals':
                    onEvent({ type: 'proposals', results: validateAll(event.proposals), settingKeys: settingKeys(event.proposals) });
                    break;
                case 'done':
                    onEvent({
                        type: 'done',
                        via: 'worker',
                        quota: isQuota(event.quota) ? event.quota : undefined,
                    });
                    break;
                case 'error':
                    failure = {
                        ok: false,
                        status: normalizeStatus(event.status),
                        message: typeof event.message === 'string' ? event.message : undefined,
                        retryAfter: typeof event.retryAfter === 'number' ? event.retryAfter : undefined,
                    };
                    break;
            }
        }
    } catch (err) {
        if (timedOut) return { ok: false, status: 'network_error', message: TIMEOUT_MESSAGE };
        if (isAbort(err)) return { ok: true, status: 'internal_error' };
        return failure ?? { ok: false, status: 'network_error' };
    } finally {
        clearTimeout(timer);
    }

    if (failure) return failure;
    if (frames === 0) {
        return {
            ok: false,
            status: 'internal_error',
            message: 'Serwer asystenta zamknal polaczenie bez zadnej odpowiedzi. Sprobuj ponownie.',
        };
    }
    return { ok: true, status: 'internal_error' };
}

function isQuota(value: unknown): value is AssistantQuota {
    return !!value && typeof value === 'object'
        && typeof (value as AssistantQuota).used === 'number'
        && typeof (value as AssistantQuota).limit === 'number';
}

const KNOWN_STATUSES: AssistantErrorStatus[] = [
    'pool_exhausted', 'quota_exceeded', 'challenge_required', 'challenge_failed',
    'bad_request', 'forbidden_origin', 'too_large', 'internal_error',
];

function normalizeStatus(value: unknown): AssistantErrorStatus {
    return typeof value === 'string' && (KNOWN_STATUSES as string[]).includes(value)
        ? value as AssistantErrorStatus
        : 'internal_error';
}

function isAbort(err: unknown): boolean {
    return err instanceof DOMException ? err.name === 'AbortError' : (err as Error)?.name === 'AbortError';
}

function safeDeviceId(): string | undefined {
    try {
        return getDeviceId();
    } catch {
        return undefined;
    }
}

// ---------------------------------------------------------------------------
// BYOK path
// ---------------------------------------------------------------------------

/**
 * Direct OpenAI-compatible call with the user's own key. Defaults to Gemini's
 * OpenAI-compatibility surface, which is what the Worker's own escape hatch
 * uses (`worker/README.md`), so the same free-tier key works either way.
 */
async function askByok(options: AskOptions, apiKey: string): Promise<void> {
    const { question, context, signal, onEvent } = options;

    let systemPrompt: string;
    try {
        const kb = await loadLeanBundle();
        systemPrompt = buildAssistantSystemPrompt(kb).systemPrompt;
    } catch {
        onEvent({
            type: 'error',
            status: 'internal_error',
            message: 'Nie udalo sie wczytac bazy wiedzy klienta (assistant-kb.json).',
        });
        return;
    }

    let response: Response;
    try {
        response = await fetch(`${getByokBaseUrl()}/chat/completions`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: getByokModel(),
                stream: true,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: buildUserMessage(question, context) },
                ],
            }),
            signal,
        });
    } catch (err) {
        if (isAbort(err)) return;
        onEvent({ type: 'error', status: 'network_error', message: statusMessage('network_error') });
        return;
    }

    if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => '');
        onEvent({
            type: 'error',
            status: response.status === 401 || response.status === 403 ? 'forbidden_origin' : 'internal_error',
            message: `Dostawca odrzucil zapytanie (HTTP ${response.status}). ${detail.slice(0, 200)}`.trim(),
        });
        return;
    }

    const extractor = new ProposalFenceExtractor();
    try {
        for await (const frame of readSse(response.body)) {
            const payload = parseSseJson(frame.data) as
                { choices?: { delta?: { content?: string } }[] } | null;
            const chunk = payload?.choices?.[0]?.delta?.content;
            if (typeof chunk !== 'string' || chunk === '') continue;
            const prose = extractor.push(chunk);
            if (prose) onEvent({ type: 'delta', text: prose });
        }
    } catch (err) {
        if (isAbort(err)) return;
        onEvent({ type: 'error', status: 'network_error', message: statusMessage('network_error') });
        return;
    }

    const { proposals } = extractor.finish();
    onEvent({ type: 'proposals', results: validateAll(proposals), settingKeys: settingKeys(proposals) });
    onEvent({ type: 'done', via: 'byok' });
}
