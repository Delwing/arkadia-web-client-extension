/**
 * Public half of the Web Push VAPID keypair.
 *
 * This is public by design: it is the `applicationServerKey` handed to
 * `pushManager.subscribe()`, and every push service sees it on every delivery.
 * It belongs in the bundle, not in a secret.
 *
 * The private half lives only as a `push-worker` secret (`VAPID_PRIVATE_KEY`,
 * stored as JWK JSON) and is never shipped to a browser.
 *
 * The two must stay a matched pair. Regenerating either one invalidates every
 * existing subscription silently — browsers keep pushing to endpoints whose
 * signatures no longer verify, with no error surfaced anywhere — so this value
 * is effectively permanent. See push-worker/README.md.
 */
export const VAPID_PUBLIC_KEY =
    'BCZxO58QHp39cdEYDjgI4WrYnlgn49H9p5phlBHRhqeUjmvDd4C6zaHxXcbcq4eC04KpqDdtqm0zc3XkaMOgHjk';

/**
 * `pushManager.subscribe()` wants the key as raw bytes, not base64url.
 *
 * The encoding is standard base64url (65 bytes: an uncompressed P-256 point,
 * `0x04 || x || y`), which `atob` cannot read directly — the `-`/`_` alphabet
 * and the stripped padding both have to be undone first.
 */
export function vapidPublicKeyBytes(): Uint8Array {
    const padded = VAPID_PUBLIC_KEY.padEnd(
        VAPID_PUBLIC_KEY.length + ((4 - (VAPID_PUBLIC_KEY.length % 4)) % 4),
        '=',
    );
    const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
