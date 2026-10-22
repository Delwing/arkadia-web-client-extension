/**
 * The anonymous contributor credential, as held by this browser.
 *
 * Global rather than per character: a contribution comes from the player, not
 * the character, and two characters agreeing on an item are one witness.
 */

import { globalStorage } from '@modules/core/storage';

export interface CrowdCredentials {
    contributorId: string;
    secret: string;
}

export function loadCrowdCredentials(): CrowdCredentials | null {
    const stored = globalStorage.get('crowdCredentials');
    if (!stored || typeof stored !== 'object') return null;
    const { contributorId, secret } = stored as CrowdCredentials;
    return typeof contributorId === 'string' && typeof secret === 'string'
        ? { contributorId, secret }
        : null;
}

export function saveCrowdCredentials(credentials: CrowdCredentials): void {
    globalStorage.set('crowdCredentials', credentials);
}

export function clearCrowdCredentials(): void {
    globalStorage.remove('crowdCredentials');
}
