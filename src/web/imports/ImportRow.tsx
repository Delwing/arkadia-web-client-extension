import { useRef, type ChangeEvent, type ReactNode } from "react";
import { Button, Notice } from "@web-ui/primitives/index.ts";

export type ImportResult = { kind: "done" | "error"; message: string } | null;

/**
 * One importable dataset on the "Import z innych klientów" page: what it is,
 * which file to pick, a button that opens the picker, and below it whatever
 * the importer needs next (a preview with options, then the result).
 */
export function ImportRow({ id, title, file, accept, busy, onFile, result, onDismiss, children }: {
    /** DOM id of the row, so a window's shortcut can scroll to it. */
    id: string;
    title: string;
    /** Which file to pick, in the user's words ("Database_wiedza.db z katalogu profilu Mudleta"). */
    file: ReactNode;
    accept: string;
    busy?: boolean;
    onFile: (file: File) => void;
    result?: ImportResult;
    onDismiss?: () => void;
    /** The preview step, shown between picking a file and importing it. */
    children?: ReactNode;
}) {
    const input = useRef<HTMLInputElement>(null);
    const pick = (event: ChangeEvent<HTMLInputElement>) => {
        const chosen = event.target.files?.[0];
        event.target.value = "";
        if (chosen) onFile(chosen);
    };
    return (
        <div className="import-row" id={id}>
            <div className="import-row__head">
                <div className="import-row__text">
                    <span className="import-row__title">{title}</span>
                    <span className="popup-field__hint">{file}</span>
                </div>
                <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>
                    {busy ? <><span className="popup-spinner" /> Wczytywanie…</> : "Wybierz plik…"}
                </Button>
                <input ref={input} type="file" accept={accept} hidden onChange={pick} />
            </div>
            {children && <div className="import-row__preview">{children}</div>}
            {result && (
                <Notice variant={result.kind === "done" ? "success" : "danger"} onClose={onDismiss}>
                    <span className="import-row__message">{result.message}</span>
                </Notice>
            )}
        </div>
    );
}

/** The confirm/cancel pair under a preview. */
export function ImportActions({ onImport, onCancel, busy }: { onImport: () => void; onCancel: () => void; busy?: boolean }) {
    return (
        <div className="popup-inline">
            <Button size="sm" variant="solid" disabled={busy} onClick={onImport}>
                {busy ? <><span className="popup-spinner" /> Importowanie…</> : "Importuj"}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>Anuluj</Button>
        </div>
    );
}
