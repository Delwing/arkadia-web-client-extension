import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Button, DeleteButton, Field, Input, Notice } from "@web-ui/primitives/index.ts";
import { canListSystemFonts, isFontAvailable, listSystemFontFamilies, systemFontPermission } from "../fonts/systemFonts";
import {
    clearUploadedFont,
    FONT_SLOTS,
    getUploadedFontFiles,
    removeUploadedFontSlot,
    slotsCovered,
    uploadFontFiles,
    UPLOADED_FONT_FACE_FAMILY,
    type FontSlot,
    type StoredFontFile,
} from "../fonts/uploadedFont";

const PREVIEW_TEXT = "Zażółć gęślą jaźń 0123456789 {}[]<>";

/** One line of sample text in a font, with bold and italic when asked. */
function FontPreview({ family, styles = false }: { family: string; styles?: boolean }) {
    return (
        <div className="ui-font-preview" style={{ fontFamily: family }}>
            <div>{PREVIEW_TEXT}</div>
            {styles && (
                <div>
                    <b>Pogrubiona</b> · <i>Kursywa</i> · <b><i>Pogrubiona kursywa</i></b>
                </div>
            )}
        </div>
    );
}

export function SystemFontField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    const [families, setFamilies] = useState<string[] | null>(null);
    const [listError, setListError] = useState(false);
    const [, setFontsLoaded] = useState(0);
    const trimmed = value.trim();
    const available = trimmed ? isFontAvailable(trimmed) : undefined;

    // A font that finishes loading after the first measure would read as missing.
    useEffect(() => {
        const fonts = document.fonts;
        if (!fonts) return;
        const onDone = () => setFontsLoaded(n => n + 1);
        fonts.addEventListener?.('loadingdone', onDone);
        return () => fonts.removeEventListener?.('loadingdone', onDone);
    }, []);

    // Ask for the installed fonts as soon as the option is picked. The browser
    // prompts only while the click that picked it still counts as a user
    // gesture; once granted the list loads silently, and without a gesture
    // (dialog reopened) the request just fails and the name is typed by hand.
    useEffect(() => {
        if (!canListSystemFonts()) return;
        let cancelled = false;
        listSystemFontFamilies().then(
            list => { if (!cancelled) setFamilies(list); },
            async () => { if (!cancelled && await systemFontPermission() === 'denied') setListError(true); },
        );
        return () => { cancelled = true; };
    }, []);

    return (
        <div id="ui-system-font-settings" className="ui-settings-stack">
            <Field
                label="Nazwa czcionki zainstalowanej w systemie"
                htmlFor="ui-system-font-family"
                hint={available === false ? "Nie znaleziono takiej czcionki w systemie, użyta będzie domyślna." : undefined}
            >
                <Input
                    id="ui-system-font-family"
                    placeholder="np. Consolas"
                    list={families ? "ui-system-font-list" : undefined}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                />
            </Field>
            {families && (
                <datalist id="ui-system-font-list">
                    {families.map(f => <option key={f} value={f} />)}
                </datalist>
            )}
            {listError && (
                <Notice variant="warning" onClose={() => setListError(false)}>
                    Brak zgody na odczyt listy czcionek. Nazwę możesz wpisać ręcznie albo zezwolić na dostęp do czcionek w ustawieniach strony.
                </Notice>
            )}
            {trimmed && available !== false && <FontPreview family={`"${trimmed.replace(/"/g, "")}", monospace`} styles />}
        </div>
    );
}

const SLOT_LABELS: Record<FontSlot, string> = {
    regular: "Zwykła",
    bold: "Pogrubiona",
    italic: "Kursywa",
    boldItalic: "Pogrubiona kursywa",
};

// The client turns font synthesis off (style.css :root), so a missing face is
// not faked: the nearest uploaded one stands in.
const MISSING_HINT: Record<FontSlot, string> = {
    regular: "brak, użyta będzie inna z wgranych",
    bold: "brak, pogrubienie nie będzie widoczne",
    italic: "brak, kursywa nie będzie widoczna",
    boldItalic: "brak, użyta będzie kursywa albo pogrubiona",
};

const ACCEPT = ".ttf,.otf,.ttc,.woff,.woff2";

/** Which stored file shows a slot: its own, or a variable font covering it. */
function slotOwners(files: StoredFontFile[]): Map<FontSlot, StoredFontFile> {
    const owners = new Map<FontSlot, StoredFontFile>();
    for (const f of files) owners.set(f.slot, f);
    for (const f of files) {
        for (const s of slotsCovered(f)) {
            if (!owners.has(s)) owners.set(s, f);
        }
    }
    return owners;
}

export function UploadedFontField({ family, onFamilyChange }: { family: string; onFamilyChange: (family: string) => void }) {
    const [files, setFiles] = useState<StoredFontFile[] | null>(null);
    const [skipped, setSkipped] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const filesRef = useRef<HTMLInputElement>(null);
    const slotRef = useRef<HTMLInputElement>(null);
    const slotTarget = useRef<FontSlot | null>(null);

    useEffect(() => {
        let cancelled = false;
        void getUploadedFontFiles().then(stored => {
            if (cancelled) return;
            setFiles(stored);
            // The setting follows the files on this device.
            const storedFamily = stored[0]?.family;
            if (storedFamily && storedFamily !== family) onFamilyChange(storedFamily);
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- read the store once on mount
    }, []);

    const owners = useMemo(() => slotOwners(files ?? []), [files]);

    const upload = async (list: File[], slot?: FontSlot) => {
        if (list.length === 0) return;
        setBusy(true);
        setError(null);
        try {
            const result = await uploadFontFiles(list, slot);
            setFiles(result.files);
            setSkipped(result.skipped);
            if (result.family) onFamilyChange(result.family);
        } catch (e) {
            console.warn("Failed to store uploaded font", e);
            setError("Nie udało się zapisać czcionki w przeglądarce.");
        } finally {
            setBusy(false);
        }
    };

    const remove = async (slot: FontSlot) => {
        const left = await removeUploadedFontSlot(slot);
        setFiles(left);
        setSkipped([]);
        if (left.length === 0) onFamilyChange("");
    };

    const clear = async () => {
        await clearUploadedFont();
        setFiles([]);
        setSkipped([]);
        onFamilyChange("");
    };

    const onDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragOver(false);
        void upload(Array.from(e.dataTransfer.files));
    };

    const pickForSlot = (slot: FontSlot) => {
        slotTarget.current = slot;
        slotRef.current?.click();
    };

    const hasFiles = !!files && files.length > 0;

    return (
        <div id="ui-uploaded-font-settings" className="ui-settings-stack">
            <div
                id="ui-font-drop"
                className={`ui-font-drop${dragOver ? " ui-font-drop--over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
            >
                <span>Przeciągnij tu pliki czcionki (TTF, OTF, WOFF, WOFF2) albo</span>
                <Button id="ui-font-upload-button" size="sm" disabled={busy} onClick={() => filesRef.current?.click()}>
                    Wybierz pliki
                </Button>
            </div>
            <input
                ref={filesRef}
                id="ui-font-upload-input"
                type="file"
                accept={ACCEPT}
                multiple
                hidden
                onChange={(e) => {
                    void upload(Array.from(e.target.files ?? []));
                    e.target.value = "";
                }}
            />
            <input
                ref={slotRef}
                id="ui-font-slot-input"
                type="file"
                accept={ACCEPT}
                hidden
                onChange={(e) => {
                    const slot = slotTarget.current;
                    if (slot) void upload(Array.from(e.target.files ?? []).slice(0, 1), slot);
                    e.target.value = "";
                }}
            />
            {hasFiles && (
                <>
                    <div className="ui-font-family-row">
                        <span className="popup-field__label">Rodzina: <strong id="ui-uploaded-font-name">{family || files[0].family}</strong></span>
                        <Button id="ui-font-clear" size="sm" variant="ghost" onClick={() => void clear()}>Usuń czcionkę</Button>
                    </div>
                    <ul id="ui-font-slots" className="ui-font-slots">
                        {FONT_SLOTS.map(slot => {
                            const owner = owners.get(slot);
                            const own = owner?.slot === slot;
                            return (
                                <li key={slot} data-slot={slot} className={owner ? "ui-font-slot ui-font-slot--filled" : "ui-font-slot"}>
                                    <span className="ui-font-slot__mark">{owner ? "✔" : "✘"}</span>
                                    <span className="ui-font-slot__label">{SLOT_LABELS[slot]}</span>
                                    <span className="ui-font-slot__file" title={owner?.fileName}>
                                        {owner
                                            ? own ? owner.fileName : `z pliku zmiennego ${owner.fileName}`
                                            : MISSING_HINT[slot]}
                                    </span>
                                    {own
                                        ? <DeleteButton title="Usuń plik" onClick={() => void remove(slot)} />
                                        : <Button size="sm" variant="ghost" disabled={busy} onClick={() => pickForSlot(slot)}>Dodaj plik</Button>}
                                </li>
                            );
                        })}
                    </ul>
                    <FontPreview family={`"${UPLOADED_FONT_FACE_FAMILY}", monospace`} styles />
                </>
            )}
            {skipped.length > 0 && (
                <Notice variant="warning" onClose={() => setSkipped([])}>
                    Pominięte pliki (inna rodzina, dodatkowa grubość albo nie czcionka): {skipped.join(", ")}
                </Notice>
            )}
            {error && <Notice variant="danger" onClose={() => setError(null)}>{error}</Notice>}
            {files && !hasFiles && family && (
                <span className="popup-field__hint">
                    Plików czcionki „{family}” nie ma na tym urządzeniu. Użyta będzie zainstalowana czcionka o tej nazwie albo domyślna.
                </span>
            )}
            <span className="popup-field__hint">
                Wgraj zwykłą, pogrubioną, kursywę i pogrubioną kursywę, by tekst gry wyglądał jak trzeba. Pliki zostają tylko w tej przeglądarce i nie są synchronizowane.
            </span>
        </div>
    );
}
