import { useState } from "react";
import eventBus from "@modules/core/eventBus";
import { getBaseCategoryFromName } from "@client/knowledgeCategories";
import type { WiedzaDbResult } from "@modules/data/wiedzaDbImport.shared";
import { mergeKnowledgeEvents, type KnowledgeEvent } from "@modules/data/dataStores/knowledgeEventsStore";
import { Field, Select } from "@web-ui/primitives/index.ts";
import { parseInWorker } from "./parseInWorker";
import { ImportActions, ImportRow, type ImportResult } from "./ImportRow";

const ALL = "__all__";

/** Fired after a Wiedza import, so an open Wiedza window reloads levels and history. */
export const WIEDZA_IMPORTED_EVENT = "wiedza-imported";

/** Writes the chosen characters' knowledge into the client's stores; returns one summary line per character. */
async function applyWiedzaImport(parsed: WiedzaDbResult, selected: string): Promise<string[]> {
    const characters = selected === ALL ? parsed.characters : [selected];
    const results: string[] = [];
    for (const sourceChar of characters) {
        const charData = parsed.byCharacter[sourceChar];
        if (!charData) continue;
        const targetChar = sourceChar.toLowerCase();

        if (charData.events.length > 0) {
            const events: KnowledgeEvent[] = charData.events.map((e) => ({
                category: e.category,
                categoryDative: e.categoryDative,
                type: e.type,
                locationId: e.locationId,
                timestamp: e.timestamp,
            }));
            const added = await mergeKnowledgeEvents(targetChar, events);
            results.push(`${sourceChar}: zdarzenia ${added}/${charData.events.length}`);
        }
        if (charData.libraries.length > 0) {
            eventBus.emit("wiedzaImportLibraries", { character: targetChar, libraries: charData.libraries });
            results.push(`${sourceChar}: biblioteki ${charData.libraries.length}`);
        }
        if (charData.books.length > 0) {
            eventBus.emit("wiedzaImportBooks", { character: targetChar, books: charData.books });
            results.push(`${sourceChar}: ksiegi ${charData.books.length}`);
        }
        if (charData.totalLevels.length > 0) {
            eventBus.emit("wiedzaImportTotalLevels", { character: targetChar, levels: charData.totalLevels });
            // Level changes also go into the history as events.
            const levelEvents: KnowledgeEvent[] = [];
            for (const lv of charData.totalLevels) {
                const category = getBaseCategoryFromName(lv.categoryName);
                if (category) {
                    levelEvents.push({ category, categoryDative: "", type: "level_change", locationId: 0, timestamp: lv.timestamp, level: lv.level });
                }
            }
            if (levelEvents.length > 0) await mergeKnowledgeEvents(targetChar, levelEvents);
            results.push(`${sourceChar}: poziomy ${charData.totalLevels.length}`);
        }
    }
    // Let an open Wiedza window redraw from the new data.
    window.dispatchEvent(new Event(WIEDZA_IMPORTED_EVENT));
    window.setTimeout(() => {
        eventBus.emit("requestKnowledgeReport");
        eventBus.emit("requestKnowledgeBookReport");
    }, 100);
    return results;
}

export default function WiedzaImport() {
    const [busy, setBusy] = useState(false);
    const [preview, setPreview] = useState<{ parsed: WiedzaDbResult; selected: string } | null>(null);
    const [result, setResult] = useState<ImportResult>(null);

    const onFile = async (file: File) => {
        setBusy(true);
        setResult(null);
        setPreview(null);
        try {
            const parsed = await parseInWorker<WiedzaDbResult>(
                () => new Worker(new URL("@modules/data/wiedzaDbImport.worker.ts", import.meta.url), { type: "module" }),
                await file.arrayBuffer(),
            );
            if (parsed.characters.length === 0) setResult({ kind: "error", message: "Baza nie zawiera zadnych danych." });
            else setPreview({ parsed, selected: ALL });
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
            const lines = await applyWiedzaImport(preview.parsed, preview.selected);
            setResult({ kind: "done", message: `Import zakonczony.\n${lines.join("\n")}` });
            setPreview(null);
        } catch (err) {
            setResult({ kind: "error", message: err instanceof Error ? err.message : "Blad importu." });
        } finally {
            setBusy(false);
        }
    };

    let totals: { events: number; libraries: number; books: number; levels: number } | null = null;
    if (preview) {
        totals = { events: 0, libraries: 0, books: 0, levels: 0 };
        const chars = preview.selected === ALL ? preview.parsed.characters : [preview.selected];
        for (const c of chars) {
            const d = preview.parsed.byCharacter[c];
            if (!d) continue;
            totals.events += d.events.length;
            totals.libraries += d.libraries.length;
            totals.books += d.books.length;
            totals.levels += d.totalLevels.length;
        }
    }

    return (
        <ImportRow
            id="import-wiedza"
            title="Wiedza"
            file={<>Plik <code>Database_wiedza.db</code> z profilu Mudleta: biblioteki, ksiegi, poziomy i historia wiedzy.</>}
            accept=".db"
            busy={busy && !preview}
            onFile={onFile}
            result={result}
            onDismiss={() => setResult(null)}
        >
            {preview && totals && (
                <>
                    <Field label="Postac">
                        <Select
                            className="settings-narrow"
                            value={preview.selected}
                            onChange={(e) => setPreview({ ...preview, selected: e.target.value })}
                        >
                            <option value={ALL}>Wszystkie postacie ({preview.parsed.characters.length})</option>
                            {preview.parsed.characters.map((c) => <option key={c} value={c}>{c}</option>)}
                        </Select>
                    </Field>
                    <p className="popup-field__hint">
                        Zdarzenia: <strong>{totals.events}</strong> · Biblioteki: <strong>{totals.libraries}</strong> ·
                        Ksiegi: <strong>{totals.books}</strong> · Poziomy: <strong>{totals.levels}</strong>
                    </p>
                    <ImportActions onImport={onImport} onCancel={() => setPreview(null)} busy={busy} />
                </>
            )}
        </ImportRow>
    );
}
