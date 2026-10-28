import { useEffect, useState } from "react";
import { getShellSettings } from "@modules/core/settings";
import { reloadToLatest, watchForNewVersion } from "../versionCheck";
import { useAppServices } from "../app/appServices";

const REPO_URL = "https://github.com/Delwing/arkadia-web-client-extension";

function formatCommitDate(raw: string): string {
    if (!raw || raw === "unknown") return raw;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

/**
 * The build under the login card, and the notice when a newer one is out.
 *
 * Reported on the login screen: an open PWA notices the new build when it
 * returns to the foreground, and the player sees it the next time they are not
 * in the middle of a game. Opting in also shows a passing toast in the
 * notification center, since a session can go on for days without the login.
 */
export function CommitInfo({ sha = __COMMIT_SHA__, date = __COMMIT_DATE__ }: { sha?: string; date?: string }) {
    const { client } = useAppServices();
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [reloading, setReloading] = useState(false);
    const formatted = formatCommitDate(date);

    useEffect(() => watchForNewVersion({
        currentSha: sha,
        onUpdate: () => {
            setUpdateAvailable(true);
            if (getShellSettings().inGameUpdateNotice) {
                client.sendEvent("notify", {
                    title: "Dostępna nowa wersja",
                    text: "Odśwież stronę, kiedy skończysz grać.",
                    source: "client",
                    key: "client.update",
                    time: 15000,
                    actions: [{ label: "Odśwież", primary: true, onClick: () => void reloadToLatest() }],
                });
            }
        },
    }), [client, sha]);

    return (
        <div id="commit-info">
            <div className="commit-info-line">
                <a className="commit-info-github" href={REPO_URL} target="_blank" rel="noopener noreferrer" title="Otwórz repozytorium na GitHub">
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" focusable="false"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" /></svg>
                </a>
                <a className="commit-info-link" href={REPO_URL} target="_blank" rel="noopener noreferrer" title={`Wersja z ${formatted}: otwórz repozytorium na GitHub`}>{sha}</a>
                <span className="commit-info-date">{` · ${formatted}`}</span>
            </div>
            {updateAvailable && (
                <div className="commit-info-update">
                    Nowa wersja dostępna
                    <button
                        type="button"
                        className="auth-btn auth-btn--sm commit-info-reload"
                        disabled={reloading}
                        onClick={() => { setReloading(true); void reloadToLatest(); }}
                    >
                        Odśwież
                    </button>
                </div>
            )}
        </div>
    );
}
