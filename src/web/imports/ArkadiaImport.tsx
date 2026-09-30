import { useState } from "react";
import { parseArkadia, parseArkadiaPatterns, type ParseResult, type PatternParseResult } from "@web/options/importArkadia.ts";
import { Check } from "@web-ui/primitives/index.ts";
import { addAliases, addTriggers } from "./addImported";
import { ImportActions, ImportRow, type ImportResult } from "./ImportRow";

interface Preview {
    aliases: ParseResult;
    patterns: PatternParseResult;
    withAliases: boolean;
    withPatterns: boolean;
}

/**
 * The Arkadia client's settings file (.json): aliases and "Przekształcanie
 * tekstu" come in one export. Reading it shows what it holds; the player picks
 * which parts to bring over. Text transformations become pattern triggers.
 */
export default function ArkadiaImport() {
    const [preview, setPreview] = useState<Preview | null>(null);
    const [result, setResult] = useState<ImportResult>(null);

    const onFile = async (file: File) => {
        setResult(null);
        setPreview(null);
        try {
            const text = await file.text();
            const aliases = parseArkadia(text);
            const patterns = parseArkadiaPatterns(text);
            if (!aliases.imported.length && !patterns.imported.length) {
                setResult({ kind: "error", message: "Plik nie zawiera aliasów ani przekształceń tekstu." });
                return;
            }
            setPreview({ aliases, patterns, withAliases: aliases.imported.length > 0, withPatterns: patterns.imported.length > 0 });
        } catch {
            setResult({ kind: "error", message: "Nie udało się odczytać pliku." });
        }
    };

    const onImport = () => {
        if (!preview) return;
        const lines: string[] = [];
        if (preview.withAliases) {
            const added = addAliases(preview.aliases.imported);
            lines.push(added ? `Zaimportowano ${added} aliasów.` : "Brak nowych aliasów.");
            if (preview.aliases.skipped.length) lines.push(`Pominięte aliasy (nieobsługiwana składnia): ${preview.aliases.skipped.join(", ")}`);
        }
        if (preview.withPatterns) {
            const added = addTriggers(preview.patterns.imported);
            lines.push(added ? `Zaimportowano ${added} przekształceń jako wyzwalacze.` : "Brak nowych przekształceń.");
            if (preview.patterns.skipped.length) lines.push(`Pominięte przekształcenia (błędny wzorzec): ${preview.patterns.skipped.join(", ")}`);
        }
        setResult({ kind: "done", message: lines.join("\n") });
        setPreview(null);
    };

    const aliasCount = preview?.aliases.imported.length ?? 0;
    const patternCount = preview?.patterns.imported.length ?? 0;

    return (
        <ImportRow
            id="import-arkadia"
            title="Aliasy i przekształcanie tekstu"
            file={<>Plik ustawień klienta Arkadii (<code>.json</code>). Aliasy o istniejącym wzorcu i takie same wyzwalacze są pomijane.</>}
            accept=".json"
            onFile={onFile}
            result={result}
            onDismiss={() => setResult(null)}
        >
            {preview && (
                <>
                    <Check
                        label={`Aliasy (${aliasCount})`}
                        checked={preview.withAliases}
                        disabled={!aliasCount}
                        onChange={e => setPreview({ ...preview, withAliases: e.target.checked })}
                    />
                    <Check
                        label={`Przekształcanie tekstu (${patternCount}) — jako wyzwalacze`}
                        checked={preview.withPatterns}
                        disabled={!patternCount}
                        onChange={e => setPreview({ ...preview, withPatterns: e.target.checked })}
                    />
                    <ImportActions
                        onImport={onImport}
                        onCancel={() => setPreview(null)}
                        disabled={!preview.withAliases && !preview.withPatterns}
                    />
                </>
            )}
        </ImportRow>
    );
}
