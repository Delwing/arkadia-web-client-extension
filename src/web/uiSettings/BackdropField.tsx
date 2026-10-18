import { useEffect, useRef, useState, type DragEvent } from "react";
import { Button, Notice } from "@web-ui/primitives/index.ts";
import { clearBackdrop, getUploadedBackdrop, storeBackdrop } from "../backdrop";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/avif";

/** The image the player uploaded for under the output: pick or drop one, or remove it. */
export function UploadedBackdropField() {
    const [fileName, setFileName] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let cancelled = false;
        void getUploadedBackdrop().then(stored => {
            if (!cancelled) setFileName(stored?.fileName ?? null);
        });
        return () => { cancelled = true; };
    }, []);

    const upload = async (file: File | undefined) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setError(`„${file.name}” nie jest obrazem.`);
            return;
        }
        setError(null);
        try {
            const stored = await storeBackdrop(file);
            setFileName(stored.fileName);
        } catch (e) {
            console.warn("Failed to store the output background image", e);
            setError("Nie udało się zapisać obrazu w przeglądarce.");
        }
    };

    const onDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragOver(false);
        void upload(e.dataTransfer.files[0]);
    };

    return (
        <div id="ui-backdrop-settings" className="ui-settings-stack">
            <div
                id="ui-backdrop-drop"
                className={`ui-font-drop${dragOver ? " ui-font-drop--over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
            >
                <span>Przeciągnij tu obraz (PNG, JPG, WebP) albo</span>
                <Button id="ui-backdrop-upload-button" size="sm" onClick={() => inputRef.current?.click()}>
                    Wybierz plik
                </Button>
            </div>
            <input
                ref={inputRef}
                id="ui-backdrop-input"
                type="file"
                accept={ACCEPT}
                hidden
                onChange={(e) => {
                    void upload(e.target.files?.[0]);
                    e.target.value = "";
                }}
            />
            {fileName && (
                <div className="ui-font-family-row">
                    <span className="popup-field__label">Obraz: <strong id="ui-backdrop-name">{fileName}</strong></span>
                    <Button
                        id="ui-backdrop-clear"
                        size="sm"
                        variant="ghost"
                        onClick={() => void clearBackdrop().then(() => setFileName(null))}
                    >
                        Usuń obraz
                    </Button>
                </div>
            )}
            {error && <Notice variant="danger" onClose={() => setError(null)}>{error}</Notice>}
            <span className="popup-field__hint">
                Obraz zostaje tylko w tej przeglądarce i nie jest synchronizowany.
            </span>
        </div>
    );
}
