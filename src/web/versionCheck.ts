/**
 * Detects that a newer build has been deployed while this page stays open.
 *
 * An installed PWA is resumed from memory rather than reloaded, often for days,
 * so a check made only at startup never fires for the players who need it most.
 * The build writes `version.json` next to `index.html` (see vite.config.ts); it
 * is fetched past every cache on start, whenever the app comes back to the
 * foreground or online, and on a slow interval.
 *
 * Reporting is left to the caller: the notice belongs on the login screen, never
 * over the game while someone is playing.
 */

export interface DeployedVersion {
    sha: string;
    date: string;
}

export const VERSION_FILE = 'version.json';
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
/** Tab switches come in bursts; one request per minute is plenty. */
const MIN_CHECK_GAP_MS = 60 * 1000;

function versionUrl(): string {
    return new URL(VERSION_FILE, document.baseURI).href;
}

/**
 * Short SHAs from `git rev-parse --short` grow as the repository does, so two
 * builds of the same commit can differ in length: one being a prefix of the
 * other means the same commit.
 */
export function isSameCommit(a: string, b: string): boolean {
    const len = Math.min(a.length, b.length);
    return len > 0 && a.substring(0, len) === b.substring(0, len);
}

export async function fetchDeployedVersion(): Promise<DeployedVersion | null> {
    try {
        const response = await fetch(versionUrl(), {cache: 'no-store'});
        if (!response.ok) return null;
        const data = await response.json();
        if (!data || typeof data.sha !== 'string' || !data.sha) return null;
        return {sha: data.sha, date: typeof data.date === 'string' ? data.date : ''};
    } catch {
        return null;
    }
}

export interface VersionWatchOptions {
    currentSha: string;
    onUpdate: (latest: DeployedVersion) => void;
    intervalMs?: number;
}

/**
 * Starts watching for a new deployment. `onUpdate` fires at most once, after
 * which watching stops. Returns a function that stops it early.
 */
export function watchForNewVersion({currentSha, onUpdate, intervalMs = CHECK_INTERVAL_MS}: VersionWatchOptions): () => void {
    if (!currentSha || currentSha === 'unknown') return () => {};

    let stopped = false;
    let inFlight = false;
    let lastCheck = 0;

    const check = async (force = false) => {
        if (stopped || inFlight) return;
        const now = Date.now();
        if (!force && now - lastCheck < MIN_CHECK_GAP_MS) return;
        lastCheck = now;
        inFlight = true;
        try {
            const latest = await fetchDeployedVersion();
            if (!stopped && latest && !isSameCommit(latest.sha, currentSha)) {
                stop();
                onUpdate(latest);
            }
        } finally {
            inFlight = false;
        }
    };

    const onVisibility = () => {
        if (document.visibilityState === 'visible') void check();
    };
    const onOnline = () => void check();
    // A lazily loaded chunk that 404s means the deploy replaced it: confirm now.
    const onPreloadError = () => void check(true);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('vite:preloadError', onPreloadError);
    const timer = setInterval(() => void check(), intervalMs);

    function stop() {
        stopped = true;
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('online', onOnline);
        window.removeEventListener('vite:preloadError', onPreloadError);
    }

    void check(true);
    return stop;
}

/**
 * Reloads onto the new build. The page itself may still sit in the HTTP cache
 * (GitHub Pages allows 10 minutes), so it is refetched first; otherwise the
 * reload could land on the old `index.html` and its old bundle again.
 */
export async function reloadToLatest(): Promise<void> {
    try {
        await fetch(location.href, {cache: 'reload'});
    } catch {
        // Offline or blocked: a plain reload is still the best we can do.
    }
    location.reload();
}
