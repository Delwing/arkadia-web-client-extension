import { useState } from "react";
import { parseBlowtorch } from "@web/options/importBlowtorch.ts";
import { addAliases } from "./addImported";
import { ImportRow, type ImportResult } from "./ImportRow";

/** Aliases from Blowtorch (.xml). The Arkadia client's file goes through `ArkadiaImport`. */
export default function AliasImport() {
    const [result, setResult] = useState<ImportResult>(null);

    const onFile = async (file: File) => {
        setResult(null);
        try {
            const added = addAliases(parseBlowtorch(await file.text()));
            setResult({ kind: "done", message: added ? `Zaimportowano ${added} aliasów.` : "Brak nowych aliasów." });
        } catch {
            setResult({ kind: "error", message: "Nie udało się zaimportować pliku." });
        }
    };

    return (
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
