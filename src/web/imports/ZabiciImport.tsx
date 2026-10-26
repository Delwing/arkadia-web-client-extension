import { useState } from "react";
import { mergeImportedKills, type KillMergeMode } from "@client/scripts/killLifetimeStorage.ts";
import { characterStorage } from "@modules/core/storage";
import type { KillDbEntry, KillDbResult } from "@modules/data/killDbImport.shared";
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
    entries: KillDbEntry[];
    selected: boolean;
}

const totalOf = (entries: KillDbEntry[]) => entries.reduce((s, e) => s + e.count, 0);
const daysOf = (entries: KillDbEntry[]) => new Set(entries.map(e => e.date)).size;
const daysLabel = (days: number) => days === 1 ? "1 dnia" : `${days} dni`;

export default function ZabiciImport() {
    const [busy, setBusy] = useState(false);
    const [preview, setPreview] = useState<{ targets: Target[]; mode: KillMergeMode } | null>(null);
    const [result, setResult] = useState<ImportResult>(null);

    const onFile = async (file: File) => {
        setBusy(true);
        setResult(null);
        setPreview(null);
        try {
            const parsed = await parseInWorker<KillDbResult>(
                () => new Worker(new URL("@modules/data/killDbImport.worker.ts", import.meta.url), { type: "module" }),
                await file.arrayBuffer(),
            );
            if (parsed.characters.length === 0) {
                setResult({ kind: "error", message: "Baza nie zawiera żadnych zabitych." });
            } else {
                const current = characterStorage.getCharacter();
                const known = [...new Set([...(current ? [current] : []), ...collectCharacters()])];
                setPreview({
                    mode: "max",
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

    const onImport = async () => {
        if (!preview) return;
        const chosen = preview.targets.filter(t => t.selected && t.entries.length > 0);
        if (chosen.length === 0) {
            setResult({ kind: "error", message: "Zaznacz co najmniej jedną postać." });
            return;
        }
        setBusy(true);
        try {
            let changed = 0;
            for (const target of chosen) {
                changed += await mergeImportedKills(target.local, target.entries, preview.mode);
            }
            const all = chosen.flatMap(t => t.entries);
            const who = chosen.map(t => t.local).join(", ");
            setResult({
                kind: "done",
                message: changed === 0
                    ? "Nic nowego — te zabicia są już w liczniku."
                    : `Zaimportowano ${totalOf(all)} zabitych (${who}).`,
            });
            setPreview(null);
        } catch (err) {
            setResult({ kind: "error", message: err instanceof Error ? err.message : "Nieznany błąd." });
        } finally {
            setBusy(false);
        }
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
            id="import-zabici"
            title="Zabici"
            file={<>Plik <code>Database_counterdaysum.db</code> z profilu Mudleta. Każda postać trafia do swojego licznika.</>}
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
                                id={`import-zabici-${t.mudlet}`}
                                checked={t.selected}
                                onChange={() => toggle(t.mudlet)}
                                label={
                                    <>
                                        <b>{t.local}</b>
                                        {" — "}
                                        {totalOf(t.entries)} zabitych z {daysLabel(daysOf(t.entries))}
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
                                onChange={(e) => setPreview({ ...preview, mode: e.target.value as KillMergeMode })}
                            >
                                <option value="max">Weź maksimum</option>
                                <option value="add">Dodaj wszystko</option>
                            </Select>
                        </Field>
                    </div>
                    <p className="popup-field__hint">
                        {preview.mode === "max"
                            ? "Dla każdego przeciwnika i dnia zostanie wzięty wyższy wynik."
                            : "Zabici z Mudleta zostaną dodani do istniejących."}
                    </p>
                    <ImportActions onImport={() => void onImport()} onCancel={() => setPreview(null)} busy={busy} />
                </>
            )}
        </ImportRow>
    );
}
