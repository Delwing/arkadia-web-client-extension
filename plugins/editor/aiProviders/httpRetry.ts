/**
 * HTTP retry helper for AI provider calls.
 *
 * Transient failures (rate limits, model overload, gateway errors) are common
 * with LLM APIs and should be retried automatically with backoff rather than
 * surfaced to the user immediately. A 503 "model is experiencing high demand"
 * is the canonical case.
 */

/** Status codes worth retrying - rate limiting and transient server/gateway errors. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const MAX_RETRIES = 4;
const MAX_BACKOFF_MS = 16000;

export interface RetryNotice {
  attempt: number;
  maxRetries: number;
  /** HTTP status that triggered the retry, or 0 for a network/throw error. */
  status: number;
  delayMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Human-readable description of a pending retry, for progress display. */
export function describeRetry(notice: RetryNotice): string {
  const seconds = Math.max(1, Math.round(notice.delayMs / 1000));
  const reason = notice.status === 0 ? 'Network error' : `Model busy (HTTP ${notice.status})`;
  return `${reason}, retrying in ${seconds}s (attempt ${notice.attempt}/${notice.maxRetries})...`;
}

/** Parse a Retry-After header (delta-seconds or HTTP-date) into milliseconds. */
function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

/** Exponential backoff with jitter, capped. attempt is 0-based. */
function backoffMs(attempt: number): number {
  const base = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
  // Add up to 25% jitter to avoid synchronized retries.
  return Math.round(base * (1 + Math.random() * 0.25));
}

/**
 * Calls `doFetch` and retries on transient failures. Returns the final Response
 * (which may be a non-OK response if retries are exhausted, so callers can still
 * read the error body). Network errors are retried too, and re-thrown if they
 * persist past the retry budget.
 */
export async function fetchWithRetry(
  doFetch: () => Promise<Response>,
  onRetry?: (notice: RetryNotice) => void
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await doFetch();

      if (response.ok || !RETRYABLE_STATUS.has(response.status)) {
        return response;
      }

      // Out of retries: return the failing response so the caller surfaces its body.
      if (attempt >= MAX_RETRIES) {
        return response;
      }

      const delayMs = parseRetryAfter(response.headers.get('retry-after')) ?? backoffMs(attempt);
      onRetry?.({ attempt: attempt + 1, maxRetries: MAX_RETRIES, status: response.status, delayMs });
      // Release the connection before sleeping.
      response.body?.cancel().catch(() => {});
      await sleep(delayMs);
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_RETRIES) break;

      const delayMs = backoffMs(attempt);
      onRetry?.({ attempt: attempt + 1, maxRetries: MAX_RETRIES, status: 0, delayMs });
      await sleep(delayMs);
    }
  }

  throw lastError;
}
