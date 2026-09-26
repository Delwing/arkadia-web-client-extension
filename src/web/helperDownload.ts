/** The helper build for this machine, from the site that serves the client. */
const HELPER_BASE_PATH = `${import.meta.env.BASE_URL}helper/arkadia-helper`;

export type HelperOs = 'win' | 'mac' | 'linux';

let appleSilicon: boolean | undefined;

/**
 * Every Mac browser reports "MacIntel" and an Intel user agent, Apple Silicon
 * included, so the GPU is the only synchronous tell: Apple Silicon renders on
 * an Apple GPU ("Apple M1", or just "Apple GPU" in Safari), Intel Macs on
 * Intel/AMD graphics.
 */
function isAppleSilicon(): boolean {
    if (appleSilicon === undefined) {
        appleSilicon = false;
        try {
            const gl = document.createElement('canvas').getContext('webgl');
            const info = gl?.getExtension('WEBGL_debug_renderer_info');
            const renderer = gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
            appleSilicon = /apple/i.test(renderer) && !/intel|amd|radeon/i.test(renderer);
        } catch {
            // No WebGL: keep the Intel build, which runs under Rosetta anyway.
        }
    }
    return appleSilicon;
}

export function getDownloadUrl(): { url: string; label: string; os: HelperOs } | null {
    const ua = navigator.userAgent.toLowerCase();
    const isArm = /arm|aarch64/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ua.includes('win')) {
        const arch = isArm ? 'arm64' : 'amd64';
        return { url: `${HELPER_BASE_PATH}-windows-${arch}.exe`, label: `Windows (${arch})`, os: 'win' };
    }
    if (ua.includes('mac')) {
        const arch = isArm || isAppleSilicon() ? 'arm64' : 'amd64';
        return { url: `${HELPER_BASE_PATH}-darwin-${arch}`, label: `macOS (${arch})`, os: 'mac' };
    }
    if (ua.includes('linux')) {
        const arch = isArm ? 'arm64' : 'amd64';
        return { url: `${HELPER_BASE_PATH}-linux-${arch}`, label: `Linux (${arch})`, os: 'linux' };
    }
    return null;
}
