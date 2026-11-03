import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@web-ui/primitives/index.ts";
import { MODAL_EVENT } from "../modals/appModal";
import { closeWindow } from "../modals/pageWindows";
import { requestLogManager } from "../logSearchRequest";
import { LOGS_DB_NAME } from "../logsDatabase";
import { formatBytes } from "./formatBytes";
import { PersistenceNotice } from "./PersistenceNotice";
import {
    databaseLabel,
    isClientDatabase,
    measureLocalStorage,
    readStorageEstimate,
    scanStorage,
    type DatabaseSize,
    type ScanProgress,
    type StorageEstimate,
} from "./storageScan";

/** A row of the breakdown: a database, or localStorage. */
interface Part {
    key: string;
    label: string;
    /** The raw name, under the label, for anyone who wants to look it up. */
    name: string;
    /** Room it takes: for a database, its measured data scaled to disk (`diskFactor`). */
    bytes: number;
    /** The data as measured, before scaling; set where it differs from `bytes`. */
    dataBytes?: number;
    records: number;
    /** Kept by the client, not by another app at the same address (or a plugin). */
    own: boolean;
    /** The unit of `records`: one, two to four, five and more. */
    recordsUnit: [string, string, string];
    error?: string;
}

function partsOf(databases: DatabaseSize[], factor: number | null): Part[] {
    const local = measureLocalStorage();
    return [
        ...databases.map((database) => ({
            key: database.name,
            label: databaseLabel(database.name),
            name: `IndexedDB · ${database.name}`,
            bytes: factor === null ? database.bytes : Math.round(database.bytes * factor),
            dataBytes: factor === null ? undefined : database.bytes,
            records: database.records,
            own: isClientDatabase(database.name),
            recordsUnit: ["wpis", "wpisy", "wpisów"] as [string, string, string],
            error: database.error,
        })),
        {
            key: "localStorage",
            label: "Ustawienia i stan",
            name: "localStorage",
            bytes: local.bytes,
            records: local.keys,
            // Shared with whatever else runs at this address, but mostly the client's.
            own: true,
            recordsUnit: ["klucz", "klucze", "kluczy"] as [string, string, string],
        },
    ].sort((a, b) => b.bytes - a.bytes);
}

/** Polish plural: 1 wpis, 2 wpisy, 5 wpisów. */
function plural(n: number, [one, few, many]: [string, string, string]): string {
    if (n === 1) return one;
    const tens = n % 100;
    const units = n % 10;
    return units >= 2 && units <= 4 && (tens < 12 || tens > 14) ? few : many;
}

const DETAIL_LABELS: Record<string, string> = {
    indexedDB: "IndexedDB",
    caches: "pamięć podręczna",
    serviceWorkerRegistrations: "service worker",
    fileSystem: "pliki",
};

/**
 * Pamięć przeglądarki: what the client keeps and how much room each part
 * takes. The browser gives a total; the parts are measured on each opening, in
 * a worker, and keep showing the last measurement while a new one runs.
 */
export function StorageReport() {
    const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
    const [parts, setParts] = useState<Part[] | null>(null);
    const [progress, setProgress] = useState<ScanProgress | null>(null);
    const [failed, setFailed] = useState(false);
    const controller = useRef<AbortController | null>(null);

    const measure = useCallback(() => {
        controller.current?.abort();
        const current = new AbortController();
        controller.current = current;
        setFailed(false);
        setProgress({ database: "", done: 0, total: 0 });
        void readStorageEstimate().then((next) => {
            if (!current.signal.aborted) setEstimate(next);
        });
        scanStorage({ onProgress: setProgress, signal: current.signal })
            .then((result) => {
                if (current.signal.aborted) return;
                setParts(partsOf(result.databases, result.diskFactor));
                setProgress(null);
            })
            .catch((error: unknown) => {
                if (current.signal.aborted) return;
                console.error("[Storage] Measuring failed:", error);
                setFailed(true);
                setProgress(null);
            });
    }, []);

    useEffect(() => {
        const modal = document.getElementById("storage-modal");
        const stop = () => {
            controller.current?.abort();
            controller.current = null;
            setProgress(null);
        };
        modal?.addEventListener(MODAL_EVENT.show, measure);
        modal?.addEventListener(MODAL_EVENT.hidden, stop);
        // The window mounts this before its first `show`, so every opening,
        // the first one too, measures through the listener.
        return () => {
            modal?.removeEventListener(MODAL_EVENT.show, measure);
            modal?.removeEventListener(MODAL_EVENT.hidden, stop);
            stop();
        };
    }, [measure]);

    const measuredTotal = parts?.reduce((sum, part) => sum + part.bytes, 0) ?? 0;
    const share = estimate ? Math.min(1, estimate.usage / estimate.quota) : 0;
    const details = estimate?.details
        ? Object.entries(estimate.details).filter(([, bytes]) => typeof bytes === "number" && bytes > 0)
        : [];

    const openLogManager = () => {
        closeWindow("storage");
        requestLogManager();
    };

    // The client's own data first; then whatever else shares this address
    // (other apps hosted under the same domain, plugins' own databases).
    const groups = [
        { key: "client", title: "Klient", hint: "", parts: parts?.filter((part) => part.own) ?? [] },
        {
            key: "other",
            title: "Inne dane pod tym adresem",
            hint: `Inne aplikacje z adresu ${location.host} albo wtyczki: dzielą z klientem to samo miejsce w przeglądarce.`,
            parts: parts?.filter((part) => !part.own) ?? [],
        },
    ].map((group) => ({ ...group, bytes: group.parts.reduce((sum, part) => sum + part.bytes, 0) }));

    const renderPart = (part: Part) => {
        const partShare = measuredTotal > 0 ? part.bytes / measuredTotal : 0;
        return (
            <tr key={part.key} data-part={part.key}>
                <td>
                    <div className="storage-report__cell">
                        <div className="storage-report__what">
                            <div className="storage-report__label">{part.label}</div>
                            <div className="storage-report__name popup-muted">
                                {part.name} · {part.records.toLocaleString("pl-PL")} {plural(part.records, part.recordsUnit)}
                                {part.dataBytes !== undefined && part.dataBytes > 0 ? ` · dane ~${formatBytes(part.dataBytes)}` : ""}
                                {part.error ? ` · nie odczytano w całości (${part.error})` : ""}
                            </div>
                        </div>
                        {part.key === LOGS_DB_NAME ? (
                            <Button size="sm" onClick={openLogManager}>
                                Zarządzaj
                            </Button>
                        ) : null}
                    </div>
                </td>
                <td className="storage-report__num">{part.bytes > 0 ? `~${formatBytes(part.bytes)}` : "—"}</td>
                <td className="storage-report__share">
                    <span className="storage-report__bar">
                        <span style={{ width: `${Math.max(partShare * 100, 0.5)}%` }} />
                    </span>
                    <span className="storage-report__percent">{Math.round(partShare * 100)}%</span>
                </td>
            </tr>
        );
    };

    return (
        <div className="storage-report">
            {estimate ? (
                <section className="storage-report__total">
                    <div className="storage-report__total-line">
                        <span className="storage-report__total-figure">
                            {formatBytes(estimate.usage)} z {formatBytes(estimate.quota)}
                        </span>
                        <span className="popup-muted">zajęte {Math.round(share * 100)}% dostępnego miejsca</span>
                    </div>
                    <span className="storage-report__bar storage-report__bar--total">
                        <span style={{ width: `${Math.max(share * 100, 0.5)}%` }} />
                    </span>
                    {details.length > 0 ? (
                        <p className="popup-muted storage-report__details">
                            Według przeglądarki:{" "}
                            {details.map(([kind, bytes]) => `${DETAIL_LABELS[kind] ?? kind} ${formatBytes(bytes!)}`).join(" · ")}
                        </p>
                    ) : null}
                    {estimate.persisted ? (
                        <p className="popup-muted storage-report__details">
                            Pamięć trwała: przeglądarka nie usunie tych danych, gdy zabraknie miejsca na dysku.
                        </p>
                    ) : (
                        <PersistenceNotice onChange={() => void readStorageEstimate().then(setEstimate)} />
                    )}
                </section>
            ) : null}

            <div className="storage-report__head">
                <span className="popup-muted">
                    {progress
                        ? progress.total > 0
                            ? `Mierzenie: ${databaseLabel(progress.database)} (${progress.done}/${progress.total})...`
                            : "Mierzenie..."
                        : failed
                          ? "Nie udało się zmierzyć baz danych."
                          : "Co zajmuje miejsce"}
                </span>
                <Button size="sm" disabled={progress !== null} onClick={measure}>
                    Zmierz ponownie
                </Button>
            </div>

            {parts ? (
                <table className="popup-table storage-report__table">
                    <thead>
                        <tr>
                            <th>Dane</th>
                            <th className="storage-report__num">Rozmiar</th>
                            <th className="storage-report__share">Udział</th>
                        </tr>
                    </thead>
                    <tbody>
                        {groups.map((group) =>
                            group.parts.length === 0 ? null : (
                                <Fragment key={group.key}>
                                    <tr className="storage-report__group" data-group={group.key}>
                                        <td>
                                            <div className="storage-report__group-title">{group.title}</div>
                                            {group.hint ? <div className="storage-report__name popup-muted">{group.hint}</div> : null}
                                        </td>
                                        <td className="storage-report__num">~{formatBytes(group.bytes)}</td>
                                        <td className="storage-report__share">
                                            <span className="storage-report__percent">
                                                {measuredTotal > 0 ? Math.round((group.bytes / measuredTotal) * 100) : 0}%
                                            </span>
                                        </td>
                                    </tr>
                                    {group.parts.map(renderPart)}
                                </Fragment>
                            ),
                        )}
                    </tbody>
                </table>
            ) : null}

            <p className="popup-muted storage-report__note">
                Rozmiary baz z „~” to szacowane miejsce na dysku: przeglądarka przechowuje dane skompresowane, więc
                zmierzone dane („dane ~…”) przeliczono proporcjonalnie do miejsca, które według niej zajmuje IndexedDB.
                Rozmiar ustawień (localStorage) to ilość zapisanych znaków.
            </p>
        </div>
    );
}
