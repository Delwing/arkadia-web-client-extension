import {isMobileOs} from '@shared/dom/mobileOs.ts';

/** The helper build for this machine, from the site that serves the client. */
const HELPER_DIR = `${import.meta.env.BASE_URL}helper/`;
const HELPER_FILE = 'arkadia-helper';

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

/**
 * The helper is a desktop app (hotkeys, window focus, a local telnet bridge),
 * so a phone or tablet gets no trace of it: no mode, menu entry or download.
 */
export function isHelperSupported(): boolean {
    return !isMobileOs();
}

/** `fileName` is the program itself, which on a Mac comes out of the downloaded zip. */
export function getDownloadUrl(): { url: string; fileName: string; label: string; os: HelperOs } | null {
    // An Android user agent says "Linux" and an iPad's says "Mac".
    if (!isHelperSupported()) return null;
    const ua = navigator.userAgent.toLowerCase();
    const isArm = /arm|aarch64/.test(ua);
    if (ua.includes('win')) {
        const arch = isArm ? 'arm64' : 'amd64';
        const fileName = `${HELPER_FILE}-windows-${arch}.exe`;
        return { url: `${HELPER_DIR}${fileName}`, fileName, label: `Windows (${arch})`, os: 'win' };
    }
    if (ua.includes('mac')) {
        const arch = isArm || isAppleSilicon() ? 'arm64' : 'amd64';
        const fileName = `${HELPER_FILE}-darwin-${arch}`;
        // Safari saves an extensionless file as "<name>.txt", so Macs get it zipped.
        return { url: `${HELPER_DIR}${fileName}.zip`, fileName, label: `macOS (${arch})`, os: 'mac' };
    }
    if (ua.includes('linux')) {
        const arch = isArm ? 'arm64' : 'amd64';
        const fileName = `${HELPER_FILE}-linux-${arch}`;
        return { url: `${HELPER_DIR}${fileName}`, fileName, label: `Linux (${arch})`, os: 'linux' };
    }
    return null;
}
