/**
 * Guards for downloaded datasets. A server that answers with an error page, a
 * 403, an empty list or a JSON error object must never replace the copy a user
 * already has: some snapshots (knowledge progress, local NPCs) also carry the
 * user's own data, which is merged against the download and pruned when the
 * download is empty.
 */

/**
 * Checks a snapshot a loader produced. Returns why it is unusable, or null
 * when it is fine.
 */
export type SnapshotValidator<TSnapshot> = (snapshot: TSnapshot) => string | null;

/** A loader result the store's validator refused; the previous snapshot is kept. */
export class InvalidSnapshotError extends Error {
  constructor(readonly reason: string) {
    super(`Downloaded data rejected: ${reason}`);
    this.name = 'InvalidSnapshotError';
  }
}

/** A download answered with a non-2xx status. */
export class HttpStatusError extends Error {
  constructor(readonly url: string, readonly status: number) {
    super(`Request for ${url} failed with HTTP ${status}`);
    this.name = 'HttpStatusError';
  }
}

export function isNonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

export function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0;
}

/**
 * Validator for a `{ data }` snapshot: `check` gets the data and returns the
 * problem, or null. A missing snapshot or data is always a problem.
 */
export function validateData<TData>(
  check: (data: TData) => string | null,
): SnapshotValidator<{ data: TData } | undefined> {
  return (snapshot) => {
    if (!snapshot || snapshot.data == null) {
      return 'no data';
    }
    return check(snapshot.data);
  };
}
