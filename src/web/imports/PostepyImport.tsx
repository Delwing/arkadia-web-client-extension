import { useState } from "react";
import { mergeLifetimeData, type MergeMode } from "@client/scripts/improveCounter.ts";
import { characterStorage } from "@modules/core/storage";
import type { ImproveDbResult } from "@modules/data/improveDbImport.shared";
import { Field, Select } from "@web-ui/primitives/index.ts";
import { parseInWorker } from "./parseInWorker";
import { ImportActions, ImportRow, type ImportResult } from "./ImportRow";

export default function PostepyImport() {
    const [busy, setBusy] = useState(false);
    const [preview, setPreview] = useState<{ parsed: ImproveDbResult; selected: string; mode: MergeMode } | null>(null);
    const [result, setResult] = useState<ImportResult>(null);
    const current = characterStorage.getCharacter();

    const onFile = async (file: File) => {
        setBusy(true);
        setResult(null);
        setPreview(null);
        try {
            const parsed = await parseInWorker<ImproveDbResult>(
                () => new Worker(new URL("@modules/data/improveDbImport.worker.ts", import.meta.url), { type: "module" }),
                await file.arrayBuffer(),
            );
            if (parsed.characters.length === 0) {
                setResult({ kind: "error", message: "Baza nie zawiera zadnych danych." });
            } else {
                const lower = current?.toLowerCase() ?? "";
                const selected = parsed.characters.find(c => c.toLowerCase() === lower) ?? parsed.characters[0];
                setPreview({ parsed, selected, mode: "max" });
            }
        } catch (err) {
            setResult({ kind: "error", message: err instanceof Error ? err.message : "Nieznany blad." });
        } finally {
            setBusy(false);
        }
    };

    const onImport = () => {
        if (!preview) return;
        const entries = preview.parsed.byCharacter[preview.selected];
        if (!entries?.length) {
            setResult({ kind: "error", message: "Brak danych dla wybranej postaci." });
            return;
        }
        if (mergeLifetimeData(entries, preview.mode)) {
            const total = entries.reduce((s, e) => s + e.count, 0);
            setResult({ kind: "done", message: `Zaimportowano ${entries.length} dni (${total} postepow).` });
            setPreview(null);
        } else {
            setResult({ kind: "error", message: "Licznik nie jest jeszcze zainicjalizowany — zaloguj sie postacia i sprobuj ponownie." });
        }
    };

    const entries = preview ? preview.parsed.byCharacter[preview.selected] ?? [] : [];

    return (
        <ImportRow
            id="import-postepy"
            title="Postępy"
            file={<>Baza postępów z Mudleta (<code>.db</code>). Trafia do licznika bieżącej postaci{current ? ` (${current})` : ""}.</>}
            accept=".db"
            busy={busy}
            onFile={onFile}
            result={result}
            onDismiss={() => setResult(null)}
        >
            {preview && (
                <>
                    <div className="settings-fields-row">
                        {preview.parsed.characters.length > 1 && (
                            <Field label="Postac z Mudleta">
                                <Select
                                    className="settings-narrow"
                                    value={preview.selected}
                                    onChange={(e) => setPreview({ ...preview, selected: e.target.value })}
                                >
                                    {preview.parsed.characters.map(c => <option key={c} value={c}>{c}</option>)}
                                </Select>
                            </Field>
                        )}
                        <Field label="Tryb">
                            <Select
                                className="settings-narrow"
                                value={preview.mode}
                                onChange={(e) => setPreview({ ...preview, mode: e.target.value as MergeMode })}
                            >
                                <option value="max">Wez maksimum</option>
                                <option value="add">Dodaj wszystko</option>
                            </Select>
                        </Field>
                    </div>
                    <p className="popup-field__hint">
                        {entries.length} dni, {entries.reduce((s, e) => s + e.count, 0)} postepow.{" "}
                        {preview.mode === "max"
                            ? "Dla kazdego dnia zostanie wziety wyzszy wynik."
                            : "Postepy z Mudleta zostana dodane do istniejacych."}
                    </p>
                    <ImportActions onImport={onImport} onCancel={() => setPreview(null)} />
                </>
            )}
        </ImportRow>
    );
}
