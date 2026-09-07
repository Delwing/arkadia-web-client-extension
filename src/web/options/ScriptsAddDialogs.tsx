import { useState, type ChangeEvent, type ReactNode } from "react";
import { Button, Form } from "react-bootstrap";
import { Code2, FileArchive, Link2, PenSquare, Sparkles, Store } from "lucide-react";
import SubDialog from "../SubDialog";
import { buildAiPluginPrompt } from "../aiPluginPrompt";

/**
 * The dialogs behind the single "Dodaj plugin" button.
 *
 * The old panel put five differently-coloured buttons in a row above the list;
 * on a phone they wrapped into a block of unlabelled colour, and on a desktop
 * they gave equal weight to "browse the catalogue" and "paste raw JavaScript".
 * One button opening a chooser ranks them instead, and leaves room to say what
 * each route is for.
 */

export type AddRoute = "catalog" | "url" | "code" | "zip" | "ai" | "editor";

const ROUTES: { key: AddRoute; icon: ReactNode; title: string; text: string; primary?: boolean }[] = [
    {
        key: "catalog",
        icon: <Store size={20} />,
        title: "Z katalogu",
        text: "Gotowe pluginy innych graczy, z aktualizacjami.",
        primary: true,
    },
    {
        key: "zip",
        icon: <FileArchive size={20} />,
        title: "Importuj ZIP",
        text: "Paczka z edytora albo od autora pluginu.",
    },
    {
        key: "code",
        icon: <Code2 size={20} />,
        title: "Wklej kod",
        text: "Pojedynczy plik JavaScript, wklejony ze schowka.",
    },
    {
        key: "url",
        icon: <Link2 size={20} />,
        title: "Z adresu URL",
        text: "Skrypt hostowany gdzie indziej, wczytywany przy starcie.",
    },
    {
        key: "ai",
        icon: <Sparkles size={20} />,
        title: "Wygeneruj z AI",
        text: "Opisz, czego potrzebujesz, i skopiuj gotowy prompt.",
    },
    {
        key: "editor",
        icon: <PenSquare size={20} />,
        title: "Otworz edytor",
        text: "Napisz plugin od zera w edytorze z podpowiedziami.",
    },
];

export function AddPluginDialog({ onPick, onClose }: { onPick: (route: AddRoute) => void; onClose: () => void }) {
    return (
        <SubDialog title="Dodaj plugin" onClose={onClose} size="lg">
            <div className="plugin-route-grid">
                {ROUTES.map((route) => (
                    <button
                        key={route.key}
                        type="button"
                        className={`plugin-route${route.primary ? " plugin-route--primary" : ""}`}
                        onClick={() => onPick(route.key)}
                    >
                        <span className="plugin-route__icon">{route.icon}</span>
                        <span className="plugin-route__title">{route.title}</span>
                        <span className="plugin-route__text">{route.text}</span>
                    </button>
                ))}
            </div>
        </SubDialog>
    );
}

export function AddUrlDialog({ onAdd, onClose }: { onAdd: (url: string) => void; onClose: () => void }) {
    const [url, setUrl] = useState("");

    const submit = () => {
        if (!url.trim()) return;
        onAdd(url);
        onClose();
    };

    return (
        <SubDialog
            title="Dodaj skrypt z URL"
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Anuluj
                    </Button>
                    <Button variant="primary" onClick={submit} disabled={!url.trim()}>
                        Dodaj
                    </Button>
                </>
            }
        >
            <Form.Group>
                <Form.Label>Adres skryptu</Form.Label>
                <Form.Control
                    type="text"
                    value={url}
                    autoFocus
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setUrl(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            submit();
                        }
                    }}
                    placeholder="URL skryptu"
                    autoComplete="off"
                />
                <Form.Text muted>
                    Skrypt jest wczytywany z tego adresu przy kazdym starcie klienta — dodawaj tylko zrodla,
                    ktorym ufasz.
                </Form.Text>
            </Form.Group>
        </SubDialog>
    );
}

export function PasteCodeDialog({
    onSubmit,
    onClose,
}: {
    onSubmit: (name: string, code: string) => void;
    onClose: () => void;
}) {
    const [name, setName] = useState("");
    const [code, setCode] = useState("");

    return (
        <SubDialog
            size="lg"
            title="Dodaj plugin z kodu"
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Anuluj
                    </Button>
                    <Button variant="primary" onClick={() => onSubmit(name, code)} disabled={!code.trim()}>
                        Dodaj plugin
                    </Button>
                </>
            }
        >
            <Form.Group className="mb-3">
                <Form.Label>Nazwa pluginu (opcjonalnie)</Form.Label>
                <Form.Control
                    type="text"
                    value={name}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
                    placeholder="Moja wtyczka"
                    autoComplete="off"
                />
            </Form.Group>
            <Form.Group>
                <Form.Label>Kod JavaScript</Form.Label>
                <Form.Control
                    as="textarea"
                    rows={15}
                    value={code}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setCode(event.target.value)}
                    placeholder="export async function init(api) { ... }"
                    autoComplete="off"
                    style={{ fontFamily: "monospace", fontSize: "0.9em" }}
                />
            </Form.Group>
        </SubDialog>
    );
}

export function AiPromptDialog({ onHaveCode, onClose }: { onHaveCode: () => void; onClose: () => void }) {
    const [description, setDescription] = useState("");
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        if (!description.trim()) return;
        try {
            await navigator.clipboard.writeText(buildAiPluginPrompt(description.trim()));
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
        } catch (error) {
            console.error("Failed to copy AI prompt:", error);
        }
    };

    return (
        <SubDialog
            size="lg"
            title="Wygeneruj plugin z AI"
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Zamknij
                    </Button>
                    <Button variant="success" onClick={onHaveCode}>
                        Mam kod, wklej go
                    </Button>
                </>
            }
        >
            <p className="text-muted">
                Opisz czego ma dokonywać plugin, skopiuj wygenerowany prompt i wklej go do wybranego czatu AI
                (np. Claude, ChatGPT). AI zwróci kod w bloku kodu — użyj przycisku kopiowania przy tym bloku,
                a następnie wklej go w oknie "Wklej kod".
            </p>
            <Form.Group className="mb-3">
                <Form.Label>Co ma robić ten plugin?</Form.Label>
                <Form.Control
                    as="textarea"
                    rows={4}
                    value={description}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDescription(event.target.value)}
                    placeholder="Np. podswietl na czerwono linie zawierajace moje imie"
                    autoComplete="off"
                />
            </Form.Group>
            <div className="d-flex flex-wrap gap-2">
                <Button variant="primary" onClick={copy} disabled={!description.trim()}>
                    Kopiuj prompt
                </Button>
                <Button variant="outline-secondary" href="https://claude.ai/new" target="_blank" rel="noopener">
                    Otwórz Claude
                </Button>
                <Button variant="outline-secondary" href="https://chatgpt.com/" target="_blank" rel="noopener">
                    Otwórz ChatGPT
                </Button>
            </div>
            {copied && <div className="mt-2 text-success">Skopiowano do schowka!</div>}
        </SubDialog>
    );
}
