/** The helper build for this machine, from the site that serves the client. */
const HELPER_BASE_PATH = `${import.meta.env.BASE_URL}helper/arkadia-helper`;

export type HelperOs = 'win' | 'mac' | 'linux';

export function getDownloadUrl(): { url: string; label: string; os: HelperOs } | null {
    const ua = navigator.userAgent.toLowerCase();
    const isArm = /arm|aarch64/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ua.includes('win')) {
        const arch = isArm ? 'arm64' : 'amd64';
        return { url: `${HELPER_BASE_PATH}-windows-${arch}.exe`, label: `Windows (${arch})`, os: 'win' };
    }
    if (ua.includes('mac')) {
        const arch = isArm ? 'arm64' : 'amd64';
        return { url: `${HELPER_BASE_PATH}-darwin-${arch}`, label: `macOS (${arch})`, os: 'mac' };
    }
    if (ua.includes('linux')) {
        const arch = isArm ? 'arm64' : 'amd64';
        return { url: `${HELPER_BASE_PATH}-linux-${arch}`, label: `Linux (${arch})`, os: 'linux' };
    }
    return null;
}
