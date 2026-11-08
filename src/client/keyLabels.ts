import { getHostPort } from './ports';

/** How the Alt modifier is named on the player's keyboard: ⌥ on a Mac, ALT elsewhere. */
export function altKeyLabel(): string {
    return getHostPort().platform.isMac ? '⌥' : 'ALT';
}
