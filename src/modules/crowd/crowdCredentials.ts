/**
 * The anonymous contributor credential, as held by this browser.
 *
 * Global rather than per character: a contribution comes from the player, not
 * the character, and two characters agreeing on an item are one witness. For
 * the same reason it syncs between the player's devices (sync V2), and a
 * device that registered before it learned of another's keeps the one it
 * replaced until the Worker has merged it (crowdSync).
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

/** Take another device's credential, keeping the one it replaces for merging. */
export function adoptCrowdCredentials(next: CrowdCredentials | null): void {
    const current = loadCrowdCredentials();
    if (next && current?.contributorId === next.contributorId) return;
    if (current && next) {
        const retired = loadRetiredCrowdCredentials();
        if (!retired.some(c => c.contributorId === current.contributorId)) {
            globalStorage.set('crowdCredentialsRetired', [...retired, current]);
        }
    }
    if (next) saveCrowdCredentials(next);
    else clearCrowdCredentials();
}

export function loadRetiredCrowdCredentials(): CrowdCredentials[] {
    const stored = globalStorage.get('crowdCredentialsRetired');
    return Array.isArray(stored)
        ? stored.filter(c => typeof c?.contributorId === 'string' && typeof c?.secret === 'string')
        : [];
}

export function saveRetiredCrowdCredentials(retired: CrowdCredentials[]): void {
    if (retired.length) globalStorage.set('crowdCredentialsRetired', retired);
    else globalStorage.remove('crowdCredentialsRetired');
}
