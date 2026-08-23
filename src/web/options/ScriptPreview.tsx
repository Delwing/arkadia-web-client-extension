import { useEffect, useState } from "react";
import { Alert, Spinner } from "react-bootstrap";
import { getScriptRegistry } from "@client/main";
import type { ScriptSurface } from "@client/ScriptRegistry";
import SubDialog from "../SubDialog";
// A component-scoped sheet, the way CombatStatusPopup does it — not the page-wide
// style.css that Settings.tsx warns against pulling into forge.
import "./ScriptPreview.css";

/**
 * What one feature script actually is: the commands it answers and its source.
 *
 * A dialog rather than an expanding row. The settings list already scrolls, and
 * a scrollable code block inside a scrollable list gives two nested scrollbars
 * fighting over the same wheel — this way the dialog owns the scroll and nothing
 * moves behind it. `SubDialog` rather than a react-bootstrap `Modal` because a
 * portaled modal cannot be opened from inside these panels; see @web/SubDialog.
 *
 * The source is fetched on demand. `?raw` turns each script into its own chunk
 * of plain text, so opening a preview costs one small request and nobody who
 * never opens one pays anything — the opposite of loading the scripts themselves
 * this way, which was measured and rejected (docs/SCRIPT_DEPENDENCIES.md,
 * *Stage 7*). Here laziness is right precisely because the default is not to look.
 */
const sources = import.meta.glob('../../client/scripts/*.ts', {
    query: '?raw',
    import: 'default',
}) as Record<string, () => Promise<string>>;

function sourceFor(id: string): (() => Promise<string>) | undefined {
    return sources[`../../client/scripts/${id}.ts`];
}

interface Props {
    id: string;
    title: string;
    running: boolean;
    onClose: () => void;
}

function ScriptPreview({ id, title, running, onClose }: Props) {
    const [code, setCode] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    const [surface, setSurface] = useState<ScriptSurface | null>(null);

    useEffect(() => {
        setSurface(getScriptRegistry()?.surfaceOf(id) ?? null);
    }, [id, running]);

    useEffect(() => {
        let cancelled = false;
        const load = sourceFor(id);
        if (!load) {
            setFailed(true);
            return;
        }
        load()
            .then(text => { if (!cancelled) setCode(text); })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [id]);

    const lineCount = code ? code.split('\n').length : 0;

    return (
        <SubDialog title={title} onClose={onClose} size="lg">
            <div className="script-preview">
                {running && surface && (surface.commands.length > 0 || surface.triggers > 0) && (
                    <div className="mb-3 small">
                        {surface.commands.length > 0 && (
                            <div className="mb-1">
                                <span className="text-body-secondary">Polecenia: </span>
                                {surface.commands.map(command => (
                                    <code key={command} className="me-2">{command}</code>
                                ))}
                            </div>
                        )}
                        {surface.triggers > 0 && (
                            <div className="text-body-secondary">
                                Triggery na wyjściu z gry: {surface.triggers}
                            </div>
                        )}
                    </div>
                )}
                {!running && (
                    // Not an error: a stopped script has registered nothing, which
                    // is the teardown working. The code below is still worth reading.
                    <p className="script-preview-off text-body-secondary small mb-3">
                        Funkcja jest wyłączona, więc nic nie ma teraz zarejestrowanego.
                    </p>
                )}

                <div className="d-flex justify-content-between align-items-center mb-1">
                    <code className="text-body-secondary small">src/client/scripts/{id}.ts</code>
                    {lineCount > 0 && <span className="text-body-secondary small">{lineCount} linii</span>}
                </div>

                {failed && (
                    <Alert variant="warning" className="py-1 px-2 small mb-0">
                        Nie udało się wczytać kodu.
                    </Alert>
                )}
                {!failed && !code && (
                    <div className="text-body-secondary small">
                        <Spinner size="sm" animation="border" /> Wczytywanie kodu…
                    </div>
                )}
                {code && <pre className="script-preview-pre"><code>{code}</code></pre>}
            </div>
        </SubDialog>
    );
}

export default ScriptPreview;
