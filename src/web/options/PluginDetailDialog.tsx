import { useEffect, useMemo, useState } from "react";
import { Button, LinkButton } from "@web-ui/primitives/index.ts";
import { AlertTriangle, ArrowUpCircle, Download, ExternalLink, Github, Trash2 } from "lucide-react";
import SubDialog from "../SubDialog";
import { renderPluginReadme } from "./pluginReadme";
import {
    compareVersions,
    fetchRegistryPlugin,
    isUpdateAvailable,
    LATEST_VERSION,
    registryPageUrl,
    type RegistryPluginDetail,
} from "@shared/marketplace/registryClient.ts";

export interface PluginDetailDialogProps {
    slug: string;
    /** The version currently installed, if any — drives install vs. update. */
    installedVersion?: string;
    onInstall: (slug: string, version: string) => void;
    onUninstall: (slug: string) => void;
    onClose: () => void;
}

/**
 * Everything the catalogue knows about one plugin: description, README, and the
 * release history — so a player can read what they are about to run before they
 * run it, and pick an older release when the newest one misbehaves.
 */
function PluginDetailDialog({
    slug,
    installedVersion,
    onInstall,
    onUninstall,
    onClose,
}: PluginDetailDialogProps) {
    const [detail, setDetail] = useState<RegistryPluginDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showAllVersions, setShowAllVersions] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        setDetail(null);
        setError(null);
        fetchRegistryPlugin(slug, controller.signal)
            .then((data) => {
                // Guarded because this panel has no error boundary above it: a
                // response missing `plugin` would throw during render and blank
                // the whole Skrypty modal, not just this dialog.
                if (data?.plugin) setDetail(data);
                else setError("Katalog zwrocil nieoczekiwana odpowiedz");
            })
            .catch((err: Error) => {
                if (err?.name !== "AbortError") setError(err.message);
            });
        return () => controller.abort();
    }, [slug]);

    const readme = useMemo(() => (detail ? renderPluginReadme(detail.readme) : ""), [detail]);

    const releases = useMemo(
        () => (detail?.versions ?? []).filter((version) => !version.yanked),
        [detail]
    );
    const visibleReleases = showAllVersions ? releases : releases.slice(0, 5);

    const latest = detail?.plugin.latestVersion ?? null;
    const upgradable = installedVersion ? isUpdateAvailable(installedVersion, latest) : false;
    // A `latest` install runs whatever the newest release is, so the version
    // list marks that one as installed and offers the rest as pins/rollbacks.
    const runningVersion = installedVersion === LATEST_VERSION ? (latest ?? undefined) : installedVersion;

    return (
        <SubDialog
            size="lg"
            title={detail?.plugin.displayName ?? slug}
            onClose={onClose}
            footer={
                <>
                    <Button onClick={onClose}>
                        Zamknij
                    </Button>
                    <LinkButton href={registryPageUrl(slug)}>
                        <ExternalLink size={14} />
                        Katalog
                    </LinkButton>
                    {installedVersion && (
                        <Button
                            variant="danger"
                            onClick={() => {
                                onUninstall(slug);
                                onClose();
                            }}
                        >
                            <Trash2 size={14} />
                            Odinstaluj
                        </Button>
                    )}
                    {latest && (!installedVersion || upgradable) && (
                        <Button
                            variant="solid"
                            onClick={() => {
                                onInstall(slug, LATEST_VERSION);
                                onClose();
                            }}
                        >
                            {upgradable ? (
                                <>
                                    <ArrowUpCircle size={14} />
                                    Aktualizuj do v{latest}
                                </>
                            ) : (
                                <>
                                    <Download size={14} />
                                    Zainstaluj v{latest}
                                </>
                            )}
                        </Button>
                    )}
                </>
            }
        >
            {error && <div className="plugin-banner plugin-banner--error">{error}</div>}

            {!detail && !error && (
                <div className="plugin-loading">
                    <span className="popup-spinner" />
                    <span>Wczytywanie...</span>
                </div>
            )}

            {detail && (
                <>
                    <p className="plugin-detail__description">{detail.plugin.description}</p>

                    <div className="plugin-detail__facts">
                        <span>Autor: {detail.plugin.owner ? `@${detail.plugin.owner.handle}` : "nieznany"}</span>
                        <span>{detail.plugin.installs} instalacji</span>
                        {detail.license && <span>Licencja: {detail.license}</span>}
                        {detail.plugin.trustedPublisher && (
                            <span
                                className="plugin-chip plugin-chip--trusted"
                                title="Wydawany automatycznie z workflow GitHub Actions powiazanego z repozytorium autora"
                            >
                                <Github size={12} />
                                Wydawane z repozytorium
                            </span>
                        )}
                        {detail.plugin.repositoryUrl && (
                            <a href={detail.plugin.repositoryUrl} target="_blank" rel="noopener noreferrer">
                                <Github size={12} />
                                Repozytorium
                            </a>
                        )}
                    </div>

                    {detail.plugin.rulesRisk && (
                        <div className="plugin-banner plugin-banner--warning">
                            <AlertTriangle size={16} />
                            <span>
                                Autor oznaczyl ten plugin jako mogacy naruszac zasady Arkadii
                                {detail.plugin.rulesRiskNote ? `: ${detail.plugin.rulesRiskNote}` : "."}
                            </span>
                        </div>
                    )}

                    {detail.plugin.deprecated && (
                        <div className="plugin-banner plugin-banner--warning">
                            Plugin wycofany: {detail.plugin.deprecated}
                        </div>
                    )}

                    {detail.plugin.tags.length > 0 && (
                        <div className="plugin-detail__tags">
                            {detail.plugin.tags.map((tag) => (
                                <span key={tag} className="plugin-chip">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}

                    {readme && (
                        <div className="plugin-detail__readme" dangerouslySetInnerHTML={{ __html: readme }} />
                    )}

                    <h6 className="plugin-detail__heading">Wersje</h6>
                    <ul className="plugin-version-list">
                        {visibleReleases.map((release) => {
                            const isInstalled = release.version === runningVersion;
                            const isOlder =
                                Boolean(runningVersion) &&
                                compareVersions(release.version, runningVersion!) < 0;
                            return (
                                <li key={release.version} className="plugin-version">
                                    <span className="plugin-version__number">v{release.version}</span>
                                    <span className="plugin-version__date">
                                        {new Date(release.publishedAt).toLocaleDateString("pl-PL")}
                                    </span>
                                    {release.changelog && (
                                        <span className="plugin-version__changelog">{release.changelog}</span>
                                    )}
                                    <Button
                                        size="sm"
                                        variant={isInstalled ? "ghost" : "secondary"}
                                        className="plugin-push-end"
                                        disabled={isInstalled}
                                        onClick={() => {
                                            onInstall(slug, release.version);
                                            onClose();
                                        }}
                                    >
                                        {isInstalled ? "Zainstalowana" : isOlder ? "Cofnij do tej" : "Zainstaluj"}
                                    </Button>
                                </li>
                            );
                        })}
                    </ul>
                    {releases.length > visibleReleases.length && (
                        <button type="button" className="popup-link ui-settings-self-start" onClick={() => setShowAllVersions(true)}>
                            Pokaz wszystkie ({releases.length})
                        </button>
                    )}
                </>
            )}
        </SubDialog>
    );
}

export default PluginDetailDialog;
