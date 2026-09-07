import type { ReactNode } from "react";
import { Spinner } from "react-bootstrap";
import { AlertTriangle, Check, Circle, FileCode2, Globe, Store } from "lucide-react";
import type { PluginSource } from "./useInstalledPlugins";

/**
 * One plugin, in the two places plugins are listed: the installed list and the
 * catalogue grid. Both wear the same card so a plugin looks the same before and
 * after it is installed — only the actions differ.
 *
 * The card is one CSS component (`.plugin-card`, in style.css and mirrored into
 * forge's scoped sheet). It reflows to a single column below 768px, where the
 * action row also grows labels: icon-only buttons are fine with a pointer and a
 * title tooltip, and are a guessing game on a phone.
 */

export type CardStatus = "ok" | "loading" | "error" | "warning" | "none";

const SOURCE_META: Record<PluginSource, { label: string; icon: ReactNode; modifier: string }> = {
    registry: { label: "Katalog", icon: <Store size={12} />, modifier: "plugin-chip--registry" },
    local: { label: "Lokalny", icon: <FileCode2 size={12} />, modifier: "plugin-chip--local" },
    url: { label: "URL", icon: <Globe size={12} />, modifier: "plugin-chip--url" },
};

export function SourceChip({ source }: { source: PluginSource }) {
    const meta = SOURCE_META[source];
    return (
        <span className={`plugin-chip ${meta.modifier}`}>
            {meta.icon}
            {meta.label}
        </span>
    );
}

function StatusMark({ status, title }: { status: CardStatus; title?: string }) {
    if (status === "none") return null;
    if (status === "loading") return <Spinner animation="border" size="sm" className="plugin-card__status" />;

    const icon =
        status === "error" ? <AlertTriangle size={14} /> : status === "warning" ? <Circle size={10} fill="currentColor" /> : <Check size={14} />;

    return (
        <span className={`plugin-card__status plugin-card__status--${status}`} title={title}>
            {icon}
        </span>
    );
}

export interface PluginCardProps {
    name: string;
    version?: string;
    status?: CardStatus;
    statusTitle?: string;
    /** Chips shown next to the title: source, tags, "Zainstalowany". */
    badges?: ReactNode;
    description?: string;
    /** Small monospace second line — a URL, a slug, an id. */
    detail?: string;
    /** Author, install count, publish date… rendered as a dot-separated row. */
    meta?: ReactNode[];
    /** Highlighted strip under the body: an update offer or an error. */
    notice?: ReactNode;
    actions?: ReactNode;
    onActivate?: () => void;
}

function PluginCard({
    name,
    version,
    status = "none",
    statusTitle,
    badges,
    description,
    detail,
    meta,
    notice,
    actions,
    onActivate,
}: PluginCardProps) {
    const interactive = Boolean(onActivate);
    const metaParts = (meta ?? []).filter(Boolean);

    return (
        <section
            className={`plugin-card${interactive ? " plugin-card--interactive" : ""}`}
            onClick={onActivate}
            onKeyDown={
                interactive
                    ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onActivate?.();
                          }
                      }
                    : undefined
            }
            tabIndex={interactive ? 0 : undefined}
            role={interactive ? "button" : undefined}
        >
            <div className="plugin-card__body">
                <div className="plugin-card__head">
                    <StatusMark status={status} title={statusTitle} />
                    <h6 className="plugin-card__name">{name}</h6>
                    {version && <span className="plugin-card__version">v{version}</span>}
                    {badges}
                </div>

                {description && <p className="plugin-card__description">{description}</p>}

                {metaParts.length > 0 && (
                    <div className="plugin-card__meta">
                        {metaParts.map((part, index) => (
                            <span key={index} className="plugin-card__meta-item">
                                {part}
                            </span>
                        ))}
                    </div>
                )}

                {/* A bare URL is already the title when nothing named the plugin;
                    printing it twice just makes the card taller. */}
                {detail && detail !== name && <code className="plugin-card__detail">{detail}</code>}

                {notice}
            </div>

            {actions && (
                <div className="plugin-card__actions" onClick={(event) => event.stopPropagation()}>
                    {actions}
                </div>
            )}
        </section>
    );
}

export default PluginCard;
