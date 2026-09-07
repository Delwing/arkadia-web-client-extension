import { useEffect, useMemo, useState } from "react";
import { Button, Spinner } from "react-bootstrap";
import { ArrowUpCircle, Check, Download, ExternalLink, Github, ShieldCheck } from "lucide-react";
import SubDialog from "../SubDialog";
import { renderPluginReadme } from "./pluginReadme";
import {
    compareVersions,
    fetchRegistryPlugin,
    isUpdateAvailable,
    registryPageUrl,
    type RegistryPluginDetail,
} from "@shared/marketplace/registryClient.ts";

export interface PluginDetailDialogProps {
    slug: string;
    /** The version currently installed, if any — drives install vs. update. */
    installedVersion?: string;
    onInstall: (slug: string, version: string) => void;
    onClose: () => void;
}

/**
 * Everything the catalogue knows about one plugin: description, README, and the
 * release history — so a player can read what they are about to run before they
 * run it, and pick an older release when the newest one misbehaves.
 */
function PluginDetailDialog({ slug, installedVersion, onInstall, onClose }: PluginDetailDialogProps) {
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

    return (
        <SubDialog
            size="lg"
            title={detail?.plugin.displayName ?? slug}
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Zamknij
                    </Button>
                    <Button variant="outline-secondary" href={registryPageUrl(slug)} target="_blank" rel="noopener">
                        <ExternalLink size={14} className="me-1" />
                        Katalog
                    </Button>
                    {latest && (
                        <Button
                            variant="primary"
                            disabled={Boolean(installedVersion) && !upgradable}
                            onClick={() => {
                                onInstall(slug, latest);
                                onClose();
                            }}
                        >
                            {upgradable ? (
                                <>
                                    <ArrowUpCircle size={14} className="me-1" />
                                    Aktualizuj do v{latest}
                                </>
                            ) : installedVersion ? (
                                <>
                                    <Check size={14} className="me-1" />
                                    Zainstalowany
                                </>
                            ) : (
                                <>
                                    <Download size={14} className="me-1" />
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
                    <Spinner animation="border" size="sm" />
                    <span>Wczytywanie...</span>
                </div>
            )}

            {detail && (
                <>
                    <p className="plugin-detail__description">{detail.plugin.description}</p>

                    <div className="plugin-detail__facts">
                        <span>
                            Autor:{" "}
                            {detail.plugin.owner ? `${detail.plugin.owner.displayName} (@${detail.plugin.owner.handle})` : "nieznany"}
                        </span>
                        <span>{detail.plugin.installs} instalacji</span>
                        {detail.license && <span>Licencja: {detail.license}</span>}
                        {detail.plugin.trustedPublisher && (
                            <span className="plugin-chip plugin-chip--trusted">
                                <ShieldCheck size={12} />
                                Wydawane z repozytorium
                            </span>
                        )}
                        {detail.plugin.repositoryUrl && (
                            <a href={detail.plugin.repositoryUrl} target="_blank" rel="noopener noreferrer">
                                <Github size={12} className="me-1" />
                                Repozytorium
                            </a>
                        )}
                    </div>

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
                            const isInstalled = release.version === installedVersion;
                            const isOlder =
                                Boolean(installedVersion) &&
                                compareVersions(release.version, installedVersion!) < 0;
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
                                        variant={isInstalled ? "outline-success" : "outline-secondary"}
                                        className="ms-auto"
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
                        <Button size="sm" variant="link" onClick={() => setShowAllVersions(true)}>
                            Pokaz wszystkie ({releases.length})
                        </Button>
                    )}
                </>
            )}
        </SubDialog>
    );
}

export default PluginDetailDialog;
