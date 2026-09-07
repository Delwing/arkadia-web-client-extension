import { useMemo, useState, type ReactNode } from "react";
import { Button } from "react-bootstrap";
import { ArrowUpCircle, ExternalLink, PackageOpen, Pencil, Store, Trash2 } from "lucide-react";
import PluginCard, { SourceChip, type CardStatus } from "./PluginCard";
import type { InstalledPlugin, PluginSource } from "./useInstalledPlugins";
import { registryPageUrl } from "@shared/marketplace/registryClient.ts";
import { editorUrl } from "../appUrls";

type Filter = "all" | PluginSource | "problems";

const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "Wszystkie" },
    { key: "registry", label: "Katalog" },
    { key: "local", label: "Lokalne" },
    { key: "url", label: "URL" },
    { key: "problems", label: "Problemy" },
];

const STATUS: Record<InstalledPlugin["status"], { mark: CardStatus; title: string }> = {
    loaded: { mark: "ok", title: "Wczytany" },
    loading: { mark: "loading", title: "Wczytywanie..." },
    error: { mark: "error", title: "Blad wczytywania" },
    legacy: { mark: "warning", title: "Stary skrypt (bez API pluginow)" },
    unknown: { mark: "warning", title: "Jeszcze nie wczytany" },
};

/**
 * One action on a card. The label is hidden on wide viewports (the icon plus a
 * tooltip is enough with a pointer) and shown on narrow ones, where an unlabeled
 * icon is a guess and the bigger target is easier to hit. `alwaysLabel` opts a
 * primary action — "Aktualizuj" — out of that, since it is the one thing on the
 * card the eye should land on.
 */
function CardAction({
    icon,
    label,
    variant = "outline-secondary",
    alwaysLabel,
    onClick,
    href,
}: {
    icon: ReactNode;
    label: string;
    variant?: string;
    alwaysLabel?: boolean;
    onClick?: () => void;
    href?: string;
}) {
    return (
        <Button
            size="sm"
            variant={variant}
            className={`plugin-action${alwaysLabel ? " plugin-action--labelled" : ""}`}
            title={label}
            onClick={onClick}
            {...(href ? { href, target: "_blank", rel: "noopener" } : {})}
        >
            {icon}
            <span className="plugin-action__label">{label}</span>
        </Button>
    );
}

export interface ScriptsInstalledProps {
    plugins: InstalledPlugin[];
    search: string;
    catalogError: string | null;
    onUpdate: (slug: string, version: string) => void;
    onRemove: (id: string) => void;
    onBrowseCatalog: () => void;
}

function ScriptsInstalled({
    plugins,
    search,
    catalogError,
    onUpdate,
    onRemove,
    onBrowseCatalog,
}: ScriptsInstalledProps) {
    const [filter, setFilter] = useState<Filter>("all");
    // Deleting a local plugin throws away the only copy of its source, so it
    // asks twice. URL and catalogue entries are re-addable, and delete at once.
    const [confirming, setConfirming] = useState<string | null>(null);

    const counts = useMemo(() => {
        const byFilter: Record<Filter, number> = { all: plugins.length, registry: 0, local: 0, url: 0, problems: 0 };
        for (const plugin of plugins) {
            byFilter[plugin.source] += 1;
            if (plugin.status === "error") byFilter.problems += 1;
        }
        return byFilter;
    }, [plugins]);

    const updatable = useMemo(() => plugins.filter((plugin) => plugin.updateVersion), [plugins]);

    const visible = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return plugins.filter((plugin) => {
            const matchesFilter =
                filter === "all" ||
                (filter === "problems" ? plugin.status === "error" : plugin.source === filter);
            if (!matchesFilter) return false;
            if (!needle) return true;
            return [plugin.name, plugin.description, plugin.author, plugin.detail]
                .filter(Boolean)
                .some((field) => field!.toLowerCase().includes(needle));
        });
    }, [plugins, filter, search]);

    return (
        <div className="plugin-panel">
            <div className="plugin-filter-bar">
                {FILTERS.map(({ key, label }) => (
                    <button
                        key={key}
                        type="button"
                        className={`plugin-filter${filter === key ? " plugin-filter--active" : ""}`}
                        onClick={() => setFilter(key)}
                        disabled={key !== "all" && counts[key] === 0}
                    >
                        {label}
                        <span className="plugin-filter__count">{counts[key]}</span>
                    </button>
                ))}
            </div>

            {updatable.length > 0 && (
                <div className="plugin-banner plugin-banner--update">
                    <ArrowUpCircle size={16} />
                    <span>
                        {updatable.length === 1
                            ? "1 plugin ma nowsza wersje w katalogu."
                            : `${updatable.length} pluginy maja nowsza wersje w katalogu.`}
                    </span>
                    <Button
                        size="sm"
                        variant="primary"
                        className="ms-auto"
                        onClick={() => updatable.forEach((plugin) => onUpdate(plugin.slug!, plugin.updateVersion!))}
                    >
                        Aktualizuj wszystkie
                    </Button>
                </div>
            )}

            {catalogError && (
                <div className="plugin-banner plugin-banner--muted">
                    Katalog jest niedostepny, sprawdzanie aktualizacji pominiete ({catalogError}).
                </div>
            )}

            {visible.length === 0 ? (
                <div className="plugin-empty">
                    <PackageOpen size={32} />
                    <p className="plugin-empty__title">
                        {plugins.length === 0 ? "Nie masz jeszcze zadnych pluginow" : "Nic nie pasuje do filtrow"}
                    </p>
                    {plugins.length === 0 && (
                        <>
                            <p className="plugin-empty__text">
                                Zainstaluj gotowy plugin z katalogu albo dodaj wlasny przyciskiem "Dodaj".
                            </p>
                            <Button variant="primary" size="sm" onClick={onBrowseCatalog}>
                                <Store size={14} className="me-1" />
                                Przegladaj katalog
                            </Button>
                        </>
                    )}
                </div>
            ) : (
                <div className="plugin-list">
                    {visible.map((plugin) => {
                        const status = STATUS[plugin.status];
                        return (
                            <PluginCard
                                key={plugin.id}
                                name={plugin.name}
                                version={plugin.version}
                                status={status.mark}
                                statusTitle={status.title}
                                badges={<SourceChip source={plugin.source} />}
                                description={plugin.description}
                                detail={plugin.detail}
                                meta={plugin.author ? [plugin.author] : []}
                                notice={
                                    plugin.status === "error" && plugin.error ? (
                                        <div className="plugin-notice plugin-notice--error">{plugin.error}</div>
                                    ) : plugin.updateVersion ? (
                                        <div className="plugin-notice plugin-notice--update">
                                            <ArrowUpCircle size={14} />
                                            <span>
                                                Dostepna wersja <strong>v{plugin.updateVersion}</strong>
                                            </span>
                                            <Button
                                                size="sm"
                                                variant="primary"
                                                className="ms-auto"
                                                onClick={() => onUpdate(plugin.slug!, plugin.updateVersion!)}
                                            >
                                                Aktualizuj
                                            </Button>
                                        </div>
                                    ) : null
                                }
                                actions={
                                    <>
                                        {plugin.source === "local" && (
                                            <CardAction
                                                icon={<Pencil size={15} />}
                                                label="Edytuj w edytorze"
                                                onClick={() => window.open(editorUrl(plugin.id), "_blank")}
                                            />
                                        )}
                                        {plugin.source === "registry" && plugin.slug && (
                                            <CardAction
                                                icon={<Store size={15} />}
                                                label="Pokaz w katalogu"
                                                href={registryPageUrl(plugin.slug)}
                                            />
                                        )}
                                        {plugin.source === "url" && (
                                            <CardAction
                                                icon={<ExternalLink size={15} />}
                                                label="Otworz zrodlo"
                                                href={plugin.id}
                                            />
                                        )}
                                        {confirming === plugin.id ? (
                                            <>
                                                <Button
                                                    size="sm"
                                                    variant="danger"
                                                    className="plugin-action plugin-action--labelled"
                                                    onClick={() => {
                                                        setConfirming(null);
                                                        onRemove(plugin.id);
                                                    }}
                                                >
                                                    Usun na zawsze
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline-secondary"
                                                    className="plugin-action plugin-action--labelled"
                                                    onClick={() => setConfirming(null)}
                                                >
                                                    Anuluj
                                                </Button>
                                            </>
                                        ) : (
                                            <CardAction
                                                icon={<Trash2 size={15} />}
                                                label="Usun"
                                                variant="outline-danger"
                                                onClick={() =>
                                                    plugin.source === "local"
                                                        ? setConfirming(plugin.id)
                                                        : onRemove(plugin.id)
                                                }
                                            />
                                        )}
                                    </>
                                }
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default ScriptsInstalled;
