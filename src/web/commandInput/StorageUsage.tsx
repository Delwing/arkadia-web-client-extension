import { useEffect, useRef, useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { attachTooltip, type TooltipCard } from "@shared/dom/tooltip.ts";

interface Usage {
    used: number;
    quota: number;
    persisted: boolean;
}

/** Above this share of the quota the bar warns; above the second, it alarms. */
const WARN_AT = 0.8;
const DANGER_AT = 0.95;

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** "531,7 MB", "2 GB": megabytes until a gigabyte, one decimal at most. */
export function formatBytes(bytes: number): string {
    const [value, unit] = bytes >= GB ? [bytes / GB, "GB"] : [bytes / MB, "MB"];
    return `${value.toLocaleString("pl-PL", { maximumFractionDigits: 1 })} ${unit}`;
}

async function readUsage(): Promise<Usage | null> {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
    try {
        const [estimate, persisted] = await Promise.all([
            navigator.storage.estimate(),
            navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false),
        ]);
        if (!estimate.quota) return null;
        return { used: estimate.usage ?? 0, quota: estimate.quota, persisted };
    } catch {
        return null;
    }
}

/** The hover card: the figures, what the persistence means, and what a full quota costs. */
export function storageCard(usage: Usage): TooltipCard {
    const percent = Math.round(Math.min(1, usage.used / usage.quota) * 100);
    return {
        header: "Pamięć przeglądarki",
        rows: [
            { label: "zajęte", content: `${formatBytes(usage.used)} z ${formatBytes(usage.quota)} (${percent}%)` },
            {
                label: usage.persisted ? "trwała" : "nietrwała",
                content: usage.persisted
                    ? "Przeglądarka nie usunie tych danych, gdy zabraknie miejsca na dysku."
                    : "Przy braku miejsca na dysku przeglądarka może usunąć te dane, łącznie z logami.",
            },
            {
                label: "logi",
                content: "Zajmują najwięcej. Gdy pamięć się zapełni, nowe przestaną się zapisywać; stare usuniesz w Logi → Zarządzaj.",
                className: "hover-tooltip__entry--hint",
            },
        ],
    };
}

/**
 * How much of the browser's storage the client takes (logs above all), and
 * whether the browser has promised not to evict it. Read each time the menu
 * opens: a full quota stops logs being saved without a word, so this is where
 * a player can see it coming.
 */
export function StorageUsage() {
    const [usage, setUsage] = useState<Usage | null>(null);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        void readUsage().then((next) => {
            if (!cancelled) setUsage(next);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!usage || !ref.current) return;
        const tooltip = attachTooltip(ref.current, storageCard(usage));
        return () => tooltip.remove();
    }, [usage]);

    if (!usage) return null;

    const share = Math.min(1, usage.used / usage.quota);
    const level = share >= DANGER_AT ? "danger" : share >= WARN_AT ? "warn" : "ok";

    return (
        <div className="command-menu__storage" data-level={level} ref={ref}>
            <span className="command-menu__storage-label">Pamięć</span>
            <span className="command-menu__storage-track">
                <span className="command-menu__storage-fill" style={{ width: `${Math.max(share * 100, 1)}%` }} />
            </span>
            <span className="command-menu__storage-text">
                {formatBytes(usage.used)} z {formatBytes(usage.quota)}
            </span>
            <span className="command-menu__storage-persist" data-persisted={usage.persisted}>
                {usage.persisted ? <Lock size={12} strokeWidth={2.2} /> : <LockOpen size={12} strokeWidth={2.2} />}
                {usage.persisted ? "trwała" : "nietrwała"}
            </span>
        </div>
    );
}
