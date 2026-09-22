import { useState } from "react";
import { mergeZlomData, type ZlomMergeMode } from "@client/scripts/zlom.ts";
import type { ZlomDbResult } from "@modules/data/zlomDbImport.shared";
import { Field, Select } from "@web-ui/primitives/index.ts";
import { parseInWorker } from "./parseInWorker";
import { ImportActions, ImportRow, type ImportResult } from "./ImportRow";

export default function ZlomImport() {
    const [busy, setBusy] = useState(false);
    const [preview, setPreview] = useState<{ parsed: ZlomDbResult; mode: ZlomMergeMode } | null>(null);
    const [result, setResult] = useState<ImportResult>(null);

    const onFile = async (file: File) => {
        setBusy(true);
        setResult(null);
        setPreview(null);
        try {
            const parsed = await parseInWorker<ZlomDbResult>(
                () => new Worker(new URL("@modules/data/zlomDbImport.worker.ts", import.meta.url), { type: "module" }),
                await file.arrayBuffer(),
            );
            if (parsed.bronie.length + parsed.tarcze.length + parsed.zbroje.length === 0) {
                setResult({ kind: "error", message: "Baza nie zawiera danych zlomu." });
            } else {
                setPreview({ parsed, mode: "replace" });
            }
        } catch (err) {
            setResult({ kind: "error", message: err instanceof Error ? err.message : "Nieznany blad." });
        } finally {
            setBusy(false);
        }
    };

    const onImport = async () => {
        if (!preview) return;
        setBusy(true);
        try {
            const counts = await mergeZlomData(preview.parsed, preview.mode);
            setResult({ kind: "done", message: `Zaimportowano: ${counts.bronie} broni, ${counts.tarcze} tarcz, ${counts.zbroje} zbroi.` });
            setPreview(null);
        } catch (err) {
            setResult({ kind: "error", message: err instanceof Error ? err.message : "Blad importu." });
        } finally {
            setBusy(false);
        }
    };

    return (
        <ImportRow
            id="import-zlom"
            title="Złom"
            file={<>Baza złomu z Mudleta (<code>.db</code> / <code>.sqlite</code>): bronie, tarcze i zbroje.</>}
            accept=".db,.sqlite"
            busy={busy && !preview}
            onFile={onFile}
            result={result}
            onDismiss={() => setResult(null)}
        >
            {preview && (
                <>
                    <Field label="Tryb">
                        <Select
                            className="settings-narrow"
                            value={preview.mode}
                            onChange={(e) => setPreview({ ...preview, mode: e.target.value as ZlomMergeMode })}
                        >
                            <option value="replace">Nadpisz istniejace</option>
                            <option value="keep">Zachowaj istniejace, dodaj nowe</option>
                            <option value="unique-short">Dodaj tylko nowe shorty</option>
                        </Select>
                    </Field>
                    <p className="popup-field__hint">
                        {preview.parsed.bronie.length} broni, {preview.parsed.tarcze.length} tarcz, {preview.parsed.zbroje.length} zbroi
                    </p>
                    <ImportActions onImport={onImport} onCancel={() => setPreview(null)} busy={busy} />
                </>
            )}
        </ImportRow>
    );
}
