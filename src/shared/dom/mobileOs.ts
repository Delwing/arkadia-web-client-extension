/**
 * Which phone OS the page runs on, for things that only make sense on a
 * desktop (the helper app) or behave differently on one (iOS audio).
 *
 * iPadOS 13+ reports a desktop Safari user agent and "MacIntel", so the
 * multi-touch count is its only tell: no Mac has a touch screen. Android in
 * Chrome's "desktop site" mode reports a Linux desktop and passes as one.
 */
export function isIOS(): boolean {
    if (typeof navigator === 'undefined') return false;
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function isAndroid(): boolean {
    return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

/** iOS, iPadOS or Android: no helper builds exist for these. */
export function isMobileOs(): boolean {
    return isIOS() || isAndroid();
}
