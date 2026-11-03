import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Notice } from "@web-ui/primitives/index.ts";
import { MODAL_EVENT } from "../modals/appModal";
import { closeWindow } from "../modals/pageWindows";
import { requestLogManager } from "../logSearchRequest";
import { LOGS_DB_NAME } from "../logsDatabase";
import { formatBytes } from "./formatBytes";
import {
    databaseLabel,
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
    bytes: number;
    records: number;
    /** The unit of `records`: one, two to four, five and more. */
    recordsUnit: [string, string, string];
    error?: string;
}

function partsOf(databases: DatabaseSize[]): Part[] {
    const local = measureLocalStorage();
    return [
        ...databases.map((database) => ({
            key: database.name,
            label: databaseLabel(database.name),
            name: `IndexedDB · ${database.name}`,
            bytes: database.bytes,
            records: database.records,
            recordsUnit: ["wpis", "wpisy", "wpisów"] as [string, string, string],
            error: database.error,
        })),
        {
            key: "localStorage",
            label: "Ustawienia i stan",
            name: "localStorage",
            bytes: local.bytes,
            records: local.keys,
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
                setParts(partsOf(result.databases));
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
                        <Notice variant="warning">
                            Pamięć nietrwała: przy braku miejsca na dysku przeglądarka może usunąć te dane, łącznie z
                            logami. Pobierz ważne logi w Logi → Zarządzaj.
                        </Notice>
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
                        {parts.map((part) => {
                            const partShare = measuredTotal > 0 ? part.bytes / measuredTotal : 0;
                            return (
                                <tr key={part.key} data-part={part.key}>
                                    <td>
                                        <div className="storage-report__label">
                                            <span>{part.label}</span>
                                            {part.key === LOGS_DB_NAME ? (
                                                <Button size="sm" onClick={openLogManager}>
                                                    Zarządzaj
                                                </Button>
                                            ) : null}
                                        </div>
                                        <div className="storage-report__name popup-muted">
                                            {part.name} · {part.records.toLocaleString("pl-PL")} {plural(part.records, part.recordsUnit)}
                                            {part.error ? ` · nie odczytano w całości (${part.error})` : ""}
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
                        })}
                    </tbody>
                </table>
            ) : null}

            <p className="popup-muted storage-report__note">
                Rozmiary z „~” to przybliżona ilość zapisanych danych. Przeglądarka przechowuje je po swojemu (często
                skompresowane), więc łączna suma nie musi się zgadzać z zajętym miejscem.
            </p>
        </div>
    );
}
