import { useState } from "react";
import { globalStorage } from "@modules/core/storage";
import { parseArkadia } from "@web/options/importArkadia.ts";
import { parseBlowtorch, type Alias } from "@web/options/importBlowtorch.ts";
import { ImportRow, type ImportResult } from "./ImportRow";

/** Adds aliases whose pattern isn't there yet; returns how many were added. */
function addAliases(imported: Alias[]): number {
    const existing = globalStorage.get("aliases");
    const list: Alias[] = Array.isArray(existing) ? existing : [];
    const fresh = imported.filter(a => !list.some(b => b.pattern === a.pattern));
    if (fresh.length) globalStorage.set("aliases", [...list, ...fresh]);
    return fresh.length;
}

/** Aliases from the Arkadia client (Mudlet package, .json) or from Blowtorch (.xml). */
export default function AliasImport({ source }: { source: "arkadia" | "blowtorch" }) {
    const [result, setResult] = useState<ImportResult>(null);

    const onFile = async (file: File) => {
        setResult(null);
        try {
            const text = await file.text();
            if (source === "arkadia") {
                const { imported, skipped } = parseArkadia(text);
                const added = addAliases(imported);
                let message = added ? `Zaimportowano ${added} aliasów.` : "Brak nowych aliasów.";
                if (skipped.length) message += `\nPominięto (nieobsługiwana składnia): ${skipped.join(", ")}`;
                setResult({ kind: "done", message });
            } else {
                const added = addAliases(parseBlowtorch(text));
                setResult({ kind: "done", message: added ? `Zaimportowano ${added} aliasów.` : "Brak nowych aliasów." });
            }
        } catch {
            setResult({ kind: "error", message: "Nie udało się zaimportować pliku." });
        }
    };

    return source === "arkadia" ? (
        <ImportRow
            id="import-aliases-arkadia"
            title="Aliasy"
            file={<>Plik ustawień klienta Arkadii (<code>.json</code>). Aliasy o istniejącym wzorcu są pomijane.</>}
            accept=".json"
            onFile={onFile}
            result={result}
            onDismiss={() => setResult(null)}
        />
    ) : (
        <ImportRow
            id="import-aliases-blowtorch"
            title="Aliasy"
            file={<>Eksport aliasów z Blowtorch (<code>.xml</code>). Aliasy o istniejącym wzorcu są pomijane.</>}
            accept=".xml"
            onFile={onFile}
            result={result}
            onDismiss={() => setResult(null)}
        />
    );
}
