/**
 * The push account credential, as held by this browser.
 *
 * Stored globally rather than per character: a phone receives alerts for
 * whichever character you happen to be playing, and the account is a property
 * of the person, not the character.
 *
 * This is the value that pairing moves between devices. It is also the value
 * that, if the user has settings sync switched on, propagates on its own —
 * which is why pairing is a convenience rather than a requirement.
 */

import { globalStorage } from '@modules/core/storage';

export interface PushCredentials {
    pushId: string;
    pushSecret: string;
}

export function loadPushCredentials(): PushCredentials | null {
    const stored = globalStorage.get('pushCredentials');
    if (!stored || typeof stored !== 'object') return null;
    const { pushId, pushSecret } = stored as PushCredentials;
    return typeof pushId === 'string' && typeof pushSecret === 'string'
        ? { pushId, pushSecret }
        : null;
}

export function savePushCredentials(credentials: PushCredentials): void {
    globalStorage.set('pushCredentials', credentials);
}

export function clearPushCredentials(): void {
    globalStorage.remove('pushCredentials');
}

export function onPushCredentialsChange(
    handler: (credentials: PushCredentials | null) => void,
): () => void {
    return globalStorage.onChange('pushCredentials', () => handler(loadPushCredentials()));
}

/** `Authorization` header value, or null when this browser has no account. */
export function pushAuthHeader(): string | null {
    const credentials = loadPushCredentials();
    return credentials ? `Bearer ${credentials.pushId}.${credentials.pushSecret}` : null;
}
