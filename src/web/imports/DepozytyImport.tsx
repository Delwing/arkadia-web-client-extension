import { useState } from "react";
import { mergeImportedDeposits, type DepositMergeMode } from "@client/scripts/deposits.ts";
import { characterStorage } from "@modules/core/storage";
import type { DepositDbEntry, DepositDbResult } from "@modules/data/depositDbImport.shared";
import { Check, Field, Select } from "@web-ui/primitives/index.ts";
import { collectCharacters } from "@web/options/exportUtils.ts";
import { parseInWorker } from "./parseInWorker";
import { ImportActions, ImportRow, type ImportResult } from "./ImportRow";
import { localCharacter } from "./localCharacter";

interface Target {
    /** The character's name in Mudlet (scripts.character_name). */
    mudlet: string;
    /** The character it is imported into here. */
    local: string;
    entries: DepositDbEntry[];
    selected: boolean;
}

function depositsLabel(count: number): string {
    if (count === 1) return "1 depozyt";
    const tens = count % 100;
    const units = count % 10;
    return units >= 2 && units <= 4 && (tens < 12 || tens > 14) ? `${count} depozyty` : `${count} depozytów`;
}

export default function DepozytyImport() {
    const [busy, setBusy] = useState(false);
    const [preview, setPreview] = useState<{ targets: Target[]; unknownBanks: string[]; mode: DepositMergeMode } | null>(null);
    const [result, setResult] = useState<ImportResult>(null);

    const onFile = async (file: File) => {
        setBusy(true);
        setResult(null);
        setPreview(null);
        try {
            const parsed = await parseInWorker<DepositDbResult>(
                () => new Worker(new URL("@modules/data/depositDbImport.worker.ts", import.meta.url), { type: "module" }),
                await file.arrayBuffer(),
            );
            if (parsed.characters.length === 0) {
                setResult({ kind: "error", message: "Baza nie zawiera żadnych depozytów." });
            } else {
                const current = characterStorage.getCharacter();
                const known = [...new Set([...(current ? [current] : []), ...collectCharacters()])];
                setPreview({
                    mode: "missing",
                    unknownBanks: parsed.unknownBanks,
                    targets: parsed.characters.map(mudlet => ({
                        mudlet,
                        local: localCharacter(mudlet, known),
                        entries: parsed.byCharacter[mudlet] ?? [],
                        selected: true,
                    })),
                });
            }
        } catch (err) {
            setResult({ kind: "error", message: err instanceof Error ? err.message : "Nieznany błąd." });
        } finally {
            setBusy(false);
        }
    };

    const onImport = () => {
        if (!preview) return;
        const chosen = preview.targets.filter(t => t.selected && t.entries.length > 0);
        if (chosen.length === 0) {
            setResult({ kind: "error", message: "Zaznacz co najmniej jedną postać." });
            return;
        }
        let written = 0;
        for (const target of chosen) {
            written += mergeImportedDeposits(target.local, target.entries, preview.mode);
        }
        const who = chosen.map(t => t.local).join(", ");
        setResult({
            kind: "done",
            message: written === 0
                ? "Nic nowego — te depozyty są już zapisane."
                : `Zaimportowano ${depositsLabel(written)} (${who}).`,
        });
        setPreview(null);
    };

    const toggle = (mudlet: string) => {
        if (!preview) return;
        setPreview({
            ...preview,
            targets: preview.targets.map(t => t.mudlet === mudlet ? { ...t, selected: !t.selected } : t),
        });
    };

    return (
        <ImportRow
            id="import-depozyty"
            title="Depozyty"
            file={<>Plik <code>Database_boxestwo.db</code> z profilu Mudleta. Każda postać dostaje swoje depozyty.</>}
            accept=".db"
            busy={busy}
            onFile={onFile}
            result={result}
            onDismiss={() => setResult(null)}
        >
            {preview && (
                <>
                    <div className="import-targets">
                        {preview.targets.map(t => (
                            <Check
                                key={t.mudlet}
                                id={`import-depozyty-${t.mudlet}`}
                                checked={t.selected}
                                onChange={() => toggle(t.mudlet)}
                                label={
                                    <>
                                        <b>{t.local}</b>
                                        {" — "}
                                        {depositsLabel(t.entries.length)}: {t.entries.map(e => e.bank).join(", ")}
                                    </>
                                }
                            />
                        ))}
                    </div>
                    <div className="settings-fields-row">
                        <Field label="Tryb">
                            <Select
                                className="settings-narrow"
                                value={preview.mode}
                                onChange={(e) => setPreview({ ...preview, mode: e.target.value as DepositMergeMode })}
                            >
                                <option value="missing">Tylko brakujące</option>
                                <option value="replace">Nadpisz</option>
                            </Select>
                        </Field>
                    </div>
                    <p className="popup-field__hint">
                        {preview.mode === "missing"
                            ? "Banki, które mają już zapisany depozyt, zostaną bez zmian."
                            : "Depozyty z Mudleta zastąpią zapisane w tych samych bankach."}
                        {preview.unknownBanks.length > 0 && ` Pominięte nieznane banki: ${preview.unknownBanks.join(", ")}.`}
                    </p>
                    <ImportActions onImport={onImport} onCancel={() => setPreview(null)} />
                </>
            )}
        </ImportRow>
    );
}
