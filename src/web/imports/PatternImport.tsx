import { useState } from "react";
import { globalStorage } from "@modules/core/storage";
import { newAutomationId } from "@modules/core/automation.ts";
import type { UserTrigger } from "@client/scripts/userTriggers.ts";
import { parseArkadiaPatterns } from "@web/options/importArkadia.ts";
import { normalizeTriggerList } from "@web/options/userTriggerNormalize.ts";
import { ImportRow, type ImportResult } from "./ImportRow";

const shape = (t: UserTrigger) => JSON.stringify([t.type ?? "pattern", t.pattern ?? "", t.flags ?? "", t.macros]);

/** Adds triggers not already there in the same shape; returns how many were added. */
function addTriggers(imported: UserTrigger[]): number {
    const existing = globalStorage.get("triggers");
    const list: UserTrigger[] = Array.isArray(existing) ? existing : [];
    const known = new Set(list.map(shape));
    const fresh = imported.filter(t => !known.has(shape(t))).map(t => ({ ...t, id: newAutomationId() }));
    if (fresh.length) globalStorage.set("triggers", normalizeTriggerList([...list, ...fresh]));
    return fresh.length;
}

/** "Przekształcanie tekstu" from the Arkadia client's settings file, as pattern triggers. */
export default function PatternImport() {
    const [result, setResult] = useState<ImportResult>(null);

    const onFile = async (file: File) => {
        setResult(null);
        try {
            const { imported, skipped } = parseArkadiaPatterns(await file.text());
            const added = addTriggers(imported);
            let message = added ? `Zaimportowano ${added} przekształceń jako wyzwalacze.` : "Brak nowych przekształceń.";
            if (skipped.length) message += `\nPominięto (zmienne w zamianie lub błędny wzorzec): ${skipped.join(", ")}`;
            setResult({ kind: "done", message });
        } catch {
            setResult({ kind: "error", message: "Nie udało się zaimportować pliku." });
        }
    };

    return (
        <ImportRow
            id="import-patterns-arkadia"
            title="Przekształcanie tekstu"
            file={<>Plik ustawień klienta Arkadii (<code>.json</code>). Trafiają do wyzwalaczy; takie same są pomijane.</>}
            accept=".json"
            onFile={onFile}
            result={result}
            onDismiss={() => setResult(null)}
        />
    );
}
