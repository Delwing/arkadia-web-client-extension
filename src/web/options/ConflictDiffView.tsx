import { useCallback, useState } from "react";
import { Button, Spinner } from "react-bootstrap";
import type { CategoryConflictInfo } from "@modules/firebase";
import { decrypt, isEncryptedData } from "@modules/firebase";
import { syncEngine } from "@modules/firebase";
import { collectCharacters, exportCategory } from "./exportUtils";
import {
    diffLines,
    expandJsonForDisplay,
    summarizeDiff,
    type DiffLine,
} from "./conflictDiff";

// Cap rendered lines so a huge category can't lock up the modal.
const MAX_RENDERED_LINES = 800;

interface ConflictDiffViewProps {
    conflict: CategoryConflictInfo;
}

/** Resolve the cloud-side content of a conflict, decrypting if needed. */
async function loadCloudContent(conflict: CategoryConflictInfo): Promise<string> {
    const payload = conflict.cloudData;
    if (!payload.encrypted) return payload.data;

    const passphrase = syncEngine.getPassphrase();
    if (!passphrase) {
        throw new Error('needs-passphrase');
    }
    const parsed = JSON.parse(payload.data);
    if (!isEncryptedData(parsed)) {
        throw new Error('decryption-failed');
    }
    return decrypt(parsed, passphrase);
}

function ConflictDiffView({ conflict }: ConflictDiffViewProps) {
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lines, setLines] = useState<DiffLine[] | null>(null);

    const loadDiff = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [localRaw, cloudRaw] = await Promise.all([
                exportCategory(conflict.category, collectCharacters()),
                loadCloudContent(conflict),
            ]);
            const localText = expandJsonForDisplay(localRaw ?? '');
            const cloudText = expandJsonForDisplay(cloudRaw);
            setLines(diffLines(localText, cloudText));
        } catch (err) {
            const message = err instanceof Error ? err.message : 'unknown';
            if (message === 'needs-passphrase') {
                setError('Dane sa zaszyfrowane. Podaj haslo szyfrowania, aby zobaczyc roznice.');
            } else if (message === 'decryption-failed') {
                setError('Nie udalo sie odszyfrowac danych z chmury.');
            } else {
                setError('Nie udalo sie przygotowac porownania.');
            }
        } finally {
            setLoading(false);
        }
    }, [conflict]);

    const handleToggle = useCallback(() => {
        const next = !expanded;
        setExpanded(next);
        if (next && lines === null && !loading) {
            void loadDiff();
        }
    }, [expanded, lines, loading, loadDiff]);

    const summary = lines ? summarizeDiff(lines) : null;
    const shown = lines ? lines.slice(0, MAX_RENDERED_LINES) : [];
    const truncated = lines ? lines.length - shown.length : 0;

    return (
        <div className="mt-1">
            <Button
                variant="link"
                size="sm"
                className="p-0 text-decoration-none"
                onClick={handleToggle}
            >
                {expanded ? '▾ Ukryj roznice' : '▸ Pokaz roznice'}
                {summary && (
                    <span className="text-muted ms-2">
                        (<span className="text-success">+{summary.added}</span>{' '}
                        <span className="text-danger">-{summary.removed}</span>)
                    </span>
                )}
            </Button>

            {expanded && (
                <div className="mt-1">
                    {loading && (
                        <div className="d-flex align-items-center gap-2 text-muted small">
                            <Spinner animation="border" size="sm" />
                            <span>Przygotowywanie porownania...</span>
                        </div>
                    )}
                    {error && <div className="text-warning small">{error}</div>}
                    {!loading && !error && lines && lines.length === 0 && (
                        <div className="text-muted small">Brak roznic do wyswietlenia.</div>
                    )}
                    {!loading && !error && lines && lines.length > 0 && (
                        <>
                            <div className="text-muted small mb-1">
                                <span className="text-danger">−</span> lokalne,{' '}
                                <span className="text-success">+</span> z chmury
                            </div>
                            <pre
                                className="small mb-0 p-2 rounded"
                                style={{
                                    maxHeight: '260px',
                                    overflow: 'auto',
                                    backgroundColor: 'rgba(0,0,0,0.25)',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                }}
                            >
                                {shown.map((line, idx) => (
                                    <div
                                        key={idx}
                                        style={{
                                            color: line.type === 'add'
                                                ? '#5cb85c'
                                                : line.type === 'remove'
                                                    ? '#d9534f'
                                                    : 'inherit',
                                        }}
                                    >
                                        {line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}
                                        {' '}
                                        {line.text}
                                    </div>
                                ))}
                                {truncated > 0 && (
                                    <div className="text-muted">
                                        ... ({truncated} wierszy wiecej — skrocono)
                                    </div>
                                )}
                            </pre>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default ConflictDiffView;
