/**
 * Wire types shared by the Worker and (eventually) the client.
 */

/** Bindings and vars. Secrets are `string | undefined` because they may be unset. */
export interface Env {
    /** KV namespace holding pool health, quota counters, device passes, cache. */
    AI_KV?: KVNamespace;

    /** JSON array of pool entry specs. See config.ts / README. */
    AI_POOL?: string;

    /** Comma-separated origin allowlist. */
    ALLOWED_ORIGINS?: string;
    /** Questions per device per UTC day. Default 20. */
    DAILY_QUOTA?: string;
    MAX_CONTEXT_BYTES?: string;
    MAX_QUESTION_CHARS?: string;
    CACHE_TTL_SECONDS?: string;
    KV_CACHE_WRITES?: string;
    TURNSTILE_ENABLED?: string;

    /** Secrets. */
    TURNSTILE_SECRET?: string;
    /** Salt for hashing device ids / IPs. Any long random string. */
    HASH_SALT?: string;

    /** Provider API keys, referenced by name from AI_POOL entries. */
    GEMINI_KEY_1?: string;
    GEMINI_KEY_2?: string;
    GROQ_KEY_1?: string;
    GROQ_KEY_2?: string;
    OPENROUTER_KEY_1?: string;
    OPENROUTER_KEY_2?: string;

    /** Optional burst limiter binding. */
    BURST_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> };
}

/** Minimal KVNamespace shape, so the project typechecks without workers-types. */
export interface KVNamespace {
    get(key: string, type: 'text'): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
}

/**
 * Structured context the client may send.
 *
 * This is the ONLY thing besides the raw question that influences the prompt,
 * and every field is validated and re-serialized by the Worker. The client never
 * sends prose that reaches the model unquoted.
 */
export interface AskContext {
    /** Which settings screen / feature the user is looking at. */
    screen?: string;
    /** Character name, for phrasing only. */
    character?: string;
    /** Settings the user currently has enabled, as key/value pairs. */
    settings?: Record<string, string | number | boolean>;
    /** Recent game output lines the question refers to. */
    recentLines?: string[];
    /** Existing triggers/aliases the user wants modified. */
    existingTriggers?: unknown[];
    existingAliases?: unknown[];
}

export interface AskRequest {
    question: string;
    context?: AskContext;
    kbVersion: string;
    /** Stable per-install id, generated client-side. */
    deviceId?: string;
    /** Turnstile token, required on first use per device. */
    turnstileToken?: string;
}

/**
 * Proposal wire shapes.
 *
 * Every field name here is the one
 * `src/modules/core/assistant/proposalValidator.ts` reads. That module is what
 * gates the write to the user's real storage, so a Worker that emits
 * `kind: "settings"` or `triggerType` is emitting proposals the client silently
 * discards. `PROPOSAL_KINDS` in `src/shared/assistant/knowledgeBundle.ts` is the
 * shared list, and `worker/test/kb.test.ts` asserts this file agrees with it.
 *
 * `label` is the one field the validator does not read: it is the Worker's own
 * requirement, shown on the client's confirmation button. The validator ignores
 * unknown fields, so carrying it is free.
 */

/** A proposed settings change the client can apply with one click. */
export interface SettingChangeProposal {
    kind: 'settingChange';
    /** Registry key, `<storageKey>.<field>` — e.g. `renderSettings.colorTheme`. */
    key: string;
    value: unknown;
    label: string;
}

/** A proposed alias. Mirrors `UserAlias` in src/client/scripts/userAliases.ts. */
export interface AliasProposal {
    kind: 'alias';
    /** Unanchored: the client compiles it as `^<pattern>$` itself. */
    pattern: string;
    command: string;
    label: string;
}

/** A proposed trigger. Mirrors `UserTrigger` in src/client/scripts/userTriggers.ts. */
export interface TriggerProposal {
    kind: 'trigger';
    type?: 'pattern' | 'event';
    pattern?: string;
    event?: string;
    flags?: string;
    macros: unknown[];
    label: string;
}

/** A proposed key bind. Mirrors `CustomBind` in src/modules/core/keymapTypes.ts. */
export interface BindProposal {
    kind: 'bind';
    /** `KeyboardEvent.code` (`KeyD`, `Numpad5`, `F5`) or a single character. */
    key: string;
    command: string;
    /** Present only when the modifier must be held. */
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    label: string;
}

export type Proposal =
    | SettingChangeProposal
    | AliasProposal
    | TriggerProposal
    | BindProposal;

/** SSE frames the Worker emits to the client. */
export type AskEvent =
    | { type: 'meta'; cached: boolean; source: string; cacheTier?: string }
    | { type: 'delta'; text: string }
    /**
     * A provider failed *after* it had already streamed text. The client must
     * discard everything received so far and render the deltas that follow as a
     * fresh answer. See router.ts for why this exists.
     */
    | { type: 'restart'; source: string }
    | { type: 'proposals'; proposals: Proposal[] }
    | { type: 'done'; quota?: { used: number; limit: number; resetsAt: number } }
    | {
          type: 'error';
          status: ErrorStatus;
          message: string;
          retryAfter?: number;
      };

export type ErrorStatus =
    | 'pool_exhausted'
    | 'quota_exceeded'
    | 'challenge_required'
    | 'challenge_failed'
    | 'bad_request'
    | 'forbidden_origin'
    | 'too_large'
    | 'internal_error';
