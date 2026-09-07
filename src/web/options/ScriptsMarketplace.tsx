import { useEffect, useMemo, useState } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import { AlertTriangle, ArrowUpCircle, Check, Download, SearchX, ShieldCheck } from "lucide-react";
import PluginCard from "./PluginCard";
import PluginDetailDialog from "./PluginDetailDialog";
import {
    isUpdateAvailable,
    searchRegistry,
    type RegistryPluginSummary,
    type RegistrySort,
} from "@shared/marketplace/registryClient.ts";

const SORTS: { key: RegistrySort; label: string }[] = [
    { key: "popular", label: "Popularne" },
    { key: "recent", label: "Ostatnio zmienione" },
    { key: "name", label: "Nazwa" },
];

const PER_PAGE = 24;

export interface ScriptsMarketplaceProps {
    search: string;
    /** slug -> installed version, so a card knows whether to offer install or update. */
    installedSlugs: Map<string, string>;
    onInstall: (slug: string, version: string) => void;
}

/**
 * The catalogue tab: a live search against the registry's public API.
 *
 * The registry paginates, so this pages with an explicit "Pokaz wiecej" rather
 * than an infinite scroll — the panel lives inside a modal whose body already
 * scrolls, and a scroll-driven loader inside a scroll container inside a dialog
 * is a reliable way to make a phone feel broken.
 */
function ScriptsMarketplace({ search, installedSlugs, onInstall }: ScriptsMarketplaceProps) {
    const [sort, setSort] = useState<RegistrySort>("popular");
    const [tag, setTag] = useState<string | null>(null);
    const [items, setItems] = useState<RegistryPluginSummary[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [detailSlug, setDetailSlug] = useState<string | null>(null);

    // Typing shouldn't fire a request per keystroke; settle first.
    const [debounced, setDebounced] = useState(search);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(search), 300);
        return () => clearTimeout(timer);
    }, [search]);

    // A new query/sort/tag starts the listing over; "Pokaz wiecej" only bumps the page.
    useEffect(() => setPage(1), [debounced, sort, tag]);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        searchRegistry({
            query: debounced,
            sort,
            tag: tag ?? undefined,
            page,
            perPage: PER_PAGE,
            signal: controller.signal,
        })
            .then((result) => {
                setError(null);
                setTotal(result.total);
                setItems((previous) => (page === 1 ? result.items : [...previous, ...result.items]));
            })
            .catch((err: Error) => {
                if (err?.name === "AbortError") return;
                setError(err.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [debounced, sort, tag, page]);

    const tags = useMemo(() => {
        const seen = new Map<string, number>();
        for (const item of items) {
            for (const value of item.tags) seen.set(value, (seen.get(value) ?? 0) + 1);
        }
        return [...seen.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 10)
            .map(([value]) => value);
    }, [items]);

    const hasMore = items.length < total;

    return (
        <div className="plugin-panel">
            <div className="plugin-catalog-controls">
                <Form.Select
                    size="sm"
                    value={sort}
                    onChange={(event) => setSort(event.target.value as RegistrySort)}
                    className="plugin-catalog-sort"
                >
                    {SORTS.map(({ key, label }) => (
                        <option key={key} value={key}>
                            {label}
                        </option>
                    ))}
                </Form.Select>
                {tags.length > 0 && (
                    <div className="plugin-filter-bar plugin-filter-bar--tags">
                        <button
                            type="button"
                            className={`plugin-filter${tag === null ? " plugin-filter--active" : ""}`}
                            onClick={() => setTag(null)}
                        >
                            Wszystkie
                        </button>
                        {tags.map((value) => (
                            <button
                                key={value}
                                type="button"
                                className={`plugin-filter${tag === value ? " plugin-filter--active" : ""}`}
                                onClick={() => setTag(tag === value ? null : value)}
                            >
                                {value}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {error && (
                <div className="plugin-banner plugin-banner--error">
                    <AlertTriangle size={16} />
                    <span>Nie udalo sie pobrac katalogu: {error}</span>
                    <Button size="sm" variant="outline-light" className="ms-auto" onClick={() => setPage(1)}>
                        Sprobuj ponownie
                    </Button>
                </div>
            )}

            {items.length === 0 && !loading && !error && (
                <div className="plugin-empty">
                    <SearchX size={32} />
                    <p className="plugin-empty__title">Katalog nie ma nic pasujacego</p>
                    <p className="plugin-empty__text">Sprobuj innej frazy albo wyczysc filtry.</p>
                </div>
            )}

            <div className="plugin-grid">
                {items.map((item) => {
                    const installed = installedSlugs.get(item.slug);
                    const upgradable = installed ? isUpdateAvailable(installed, item.latestVersion) : false;

                    return (
                        <PluginCard
                            key={item.slug}
                            name={item.displayName}
                            version={item.latestVersion ?? undefined}
                            badges={
                                <>
                                    {installed && !upgradable && (
                                        <span className="plugin-chip plugin-chip--installed">
                                            <Check size={12} />
                                            Zainstalowany
                                        </span>
                                    )}
                                    {item.trustedPublisher && (
                                        <span
                                            className="plugin-chip plugin-chip--trusted"
                                            title="Wydawany automatycznie z repozytorium autora"
                                        >
                                            <ShieldCheck size={12} />
                                            Zweryfikowany
                                        </span>
                                    )}
                                    {item.deprecated && (
                                        <span className="plugin-chip plugin-chip--deprecated">Wycofany</span>
                                    )}
                                </>
                            }
                            description={item.description}
                            meta={[
                                item.owner ? `@${item.owner.handle}` : "nieznany autor",
                                `${item.installs} instalacji`,
                                ...item.tags.slice(0, 3),
                            ]}
                            onActivate={() => setDetailSlug(item.slug)}
                            actions={
                                item.latestVersion ? (
                                    <Button
                                        size="sm"
                                        variant={upgradable ? "primary" : installed ? "outline-secondary" : "primary"}
                                        className="plugin-action plugin-action--labelled"
                                        disabled={Boolean(installed) && !upgradable}
                                        onClick={() => onInstall(item.slug, item.latestVersion!)}
                                    >
                                        {upgradable ? (
                                            <>
                                                <ArrowUpCircle size={15} />
                                                <span className="plugin-action__label">
                                                    Aktualizuj do v{item.latestVersion}
                                                </span>
                                            </>
                                        ) : installed ? (
                                            <>
                                                <Check size={15} />
                                                <span className="plugin-action__label">Zainstalowany</span>
                                            </>
                                        ) : (
                                            <>
                                                <Download size={15} />
                                                <span className="plugin-action__label">Zainstaluj</span>
                                            </>
                                        )}
                                    </Button>
                                ) : null
                            }
                        />
                    );
                })}
            </div>

            {loading && (
                <div className="plugin-loading">
                    <Spinner animation="border" size="sm" />
                    <span>Wczytywanie katalogu...</span>
                </div>
            )}

            {hasMore && !loading && (
                <div className="plugin-more">
                    <Button size="sm" variant="outline-secondary" onClick={() => setPage((current) => current + 1)}>
                        Pokaz wiecej ({items.length} z {total})
                    </Button>
                </div>
            )}

            {detailSlug && (
                <PluginDetailDialog
                    slug={detailSlug}
                    installedVersion={installedSlugs.get(detailSlug)}
                    onInstall={onInstall}
                    onClose={() => setDetailSlug(null)}
                />
            )}
        </div>
    );
}

export default ScriptsMarketplace;
