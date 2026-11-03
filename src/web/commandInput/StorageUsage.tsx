import { useEffect, useRef, useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { attachTooltip } from "@shared/dom/tooltip.ts";
import { formatBytes } from "@web/storage/formatBytes.ts";
import { readStorageEstimate } from "@web/storage/storageScan.ts";
import { storageCard, type Usage } from "@web/storage/storageCard.ts";

/** Above this share of the quota the bar warns; above the second, it alarms. */
const WARN_AT = 0.8;
const DANGER_AT = 0.95;

/**
 * How much of the browser's storage the client takes (logs above all), and
 * whether the browser has promised not to evict it. Read each time the menu
 * opens: a full quota stops logs being saved without a word, so this is where
 * a player can see it coming. A click opens the breakdown (`onOpen`).
 */
export function StorageUsage({ onOpen }: { onOpen?: () => void }) {
    const [usage, setUsage] = useState<Usage | null>(null);
    // Known at once: a browser without the API never gets the row, so the
    // menu does not grow when the figures come in (they take a moment).
    const [supported, setSupported] = useState(() => typeof navigator !== "undefined" && !!navigator.storage?.estimate);
    const ref = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!supported) return;
        let cancelled = false;
        void readStorageEstimate().then((estimate) => {
            if (cancelled) return;
            if (estimate) setUsage({ used: estimate.usage, quota: estimate.quota, persisted: estimate.persisted });
            else setSupported(false);
        });
        return () => {
            cancelled = true;
        };
    }, [supported]);

    useEffect(() => {
        if (!usage || !ref.current) return;
        const tooltip = attachTooltip(ref.current, storageCard(usage));
        return () => tooltip.remove();
    }, [usage]);

    if (!supported) return null;
    if (!usage) {
        // The row as it will be, with nothing in it yet: same height, same place.
        return (
            <button type="button" className="command-menu__storage" data-level="loading" onClick={onOpen}>
                <span className="command-menu__storage-label">Pamięć</span>
                <span className="command-menu__storage-track" />
                <span className="command-menu__storage-text">…</span>
            </button>
        );
    }

    const share = Math.min(1, usage.used / usage.quota);
    const level = share >= DANGER_AT ? "danger" : share >= WARN_AT ? "warn" : "ok";

    return (
        <button type="button" className="command-menu__storage" data-level={level} ref={ref} onClick={onOpen}>
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
        </button>
    );
}
