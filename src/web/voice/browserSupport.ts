/**
 * Which browsers can actually dictate.
 *
 * `webkitSpeechRecognition` existing proves nothing: the speech backend is
 * reached with credentials compiled into the browser build, and forks that
 * strip them (Brave, ungoogled-chromium, most distro `chromium` packages) still
 * expose the whole API and fail every run with a `network` error. Offering the
 * button there is a promise the browser cannot keep, so this allowlists the two
 * builds known to carry a working service instead.
 */

interface BrandLike {
    brand: string;
}

export interface NavigatorLike {
    userAgent?: string;
    userAgentData?: {brands?: BrandLike[]};
    /** Brave and only Brave defines this. */
    brave?: unknown;
}

/** Chromium forks that ship the API without a service behind it. */
const UNSUPPORTED = ['Brave', 'OPR', 'Opera', 'Vivaldi', 'YaBrowser', 'SamsungBrowser'];
/** Builds whose vendor runs a speech service: Google's and Microsoft's. */
const SUPPORTED_BRANDS = ['Google Chrome', 'Microsoft Edge'];

export function hasWorkingSpeechService(nav: NavigatorLike | undefined = globalThis.navigator): boolean {
    if (!nav) return false;

    // Brave masquerades as Chrome down to its user-agent brands, so the only
    // reliable tell is the object it injects for its own APIs.
    if ('brave' in nav && nav.brave) return false;

    const brands = nav.userAgentData?.brands?.map((entry) => entry.brand) ?? [];
    const userAgent = nav.userAgent ?? '';
    const mentions = (name: string): boolean =>
        brands.some((brand) => brand.includes(name)) || userAgent.includes(name);

    if (UNSUPPORTED.some(mentions)) return false;
    if (brands.length > 0) return SUPPORTED_BRANDS.some(mentions);

    // No user-agent brands: an older build, or a browser outside Chromium. Fall
    // back to the user-agent, where Chrome and Edge still name themselves.
    return userAgent.includes('Edg/') || userAgent.includes('Chrome/');
}
