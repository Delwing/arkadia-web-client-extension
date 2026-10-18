import { useEffect, useRef, useState, type DragEvent } from "react";
import { Button, Notice } from "@web-ui/primitives/index.ts";
import { clearOutputImage, getUploadedOutputImage, storeOutputImage } from "../outputBackgroundImage";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/avif";

/** The image the player uploaded for under the output: pick or drop one, or remove it. */
export function UploadedOutputImageField() {
    const [fileName, setFileName] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let cancelled = false;
        void getUploadedOutputImage().then(stored => {
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
            const stored = await storeOutputImage(file);
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
        <div id="ui-output-image-settings" className="ui-settings-stack">
            <div
                id="ui-output-image-drop"
                className={`ui-font-drop${dragOver ? " ui-font-drop--over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
            >
                <span>Przeciągnij tu obraz (PNG, JPG, WebP) albo</span>
                <Button id="ui-output-image-upload-button" size="sm" onClick={() => inputRef.current?.click()}>
                    Wybierz plik
                </Button>
            </div>
            <input
                ref={inputRef}
                id="ui-output-image-input"
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
                    <span className="popup-field__label">Obraz: <strong id="ui-output-image-name">{fileName}</strong></span>
                    <Button
                        id="ui-output-image-clear"
                        size="sm"
                        variant="ghost"
                        onClick={() => void clearOutputImage().then(() => setFileName(null))}
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
