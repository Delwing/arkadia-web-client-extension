/**
 * Contributor identity, without an identity provider.
 *
 * Same arrangement as the push Worker: a random id plus a random secret, minted
 * on opt-in and presented as `Authorization: Bearer <id>.<secret>`. It does not
 * say who anyone is. It exists for three things only — counting distinct
 * players behind a version, a daily quota, and dropping one bad source at once.
 *
 * The secret is never stored, only its SHA-256.
 */

export interface Credentials {
    contributorId: string;
    secret: string;
}

function base64UrlEncode(bytes: Uint8Array | ArrayBuffer): string {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = '';
    for (const byte of view) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBase64Url(bytes: number): string {
    return base64UrlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function mintCredentials(): Credentials {
    return {
        contributorId: randomBase64Url(16),
        secret: randomBase64Url(32),
    };
}

export async function sha256(text: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return base64UrlEncode(digest);
}

/** Both operands are SHA-256 digests of equal length, so the early return leaks nothing. */
export function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let difference = 0;
    for (let i = 0; i < a.length; i++) {
        difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return difference === 0;
}

export function parseBearer(header: string | null): Credentials | null {
    if (!header) return null;
    const match = /^Bearer\s+([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(header.trim());
    if (!match) return null;
    return { contributorId: match[1]!, secret: match[2]! };
}
