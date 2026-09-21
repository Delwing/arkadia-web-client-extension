import { useState, type ChangeEvent, type ReactNode } from "react";
import { Button, Field, Input, LinkButton, TextArea } from "@web-ui/primitives/index.ts";
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
                    <Button onClick={onClose}>
                        Anuluj
                    </Button>
                    <Button variant="solid" onClick={submit} disabled={!url.trim()}>
                        Dodaj
                    </Button>
                </>
            }
        >
            <Field
                label="Adres skryptu"
                hint="Skrypt jest wczytywany z tego adresu przy kazdym starcie klienta — dodawaj tylko zrodla, ktorym ufasz."
            >
                <Input
                    mono
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
                />
            </Field>
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
                    <Button onClick={onClose}>
                        Anuluj
                    </Button>
                    <Button variant="solid" onClick={() => onSubmit(name, code)} disabled={!code.trim()}>
                        Dodaj plugin
                    </Button>
                </>
            }
        >
            <div className="popup-stack">
                <Field label="Nazwa pluginu (opcjonalnie)">
                    <Input
                        value={name}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
                        placeholder="Moja wtyczka"
                        autoComplete="off"
                    />
                </Field>
                <Field label="Kod JavaScript">
                    <TextArea
                        mono
                        rows={15}
                        value={code}
                        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setCode(event.target.value)}
                        placeholder="export async function init(api) { ... }"
                    />
                </Field>
            </div>
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
                    <Button onClick={onClose}>
                        Zamknij
                    </Button>
                    <Button variant="solid" onClick={onHaveCode}>
                        Mam kod, wklej go
                    </Button>
                </>
            }
        >
            <div className="popup-stack">
            <p className="popup-field__hint plugin-ai__intro">
                Opisz czego ma dokonywać plugin, skopiuj wygenerowany prompt i wklej go do wybranego czatu AI
                (np. Claude, ChatGPT). AI zwróci kod w bloku kodu — użyj przycisku kopiowania przy tym bloku,
                a następnie wklej go w oknie "Wklej kod".
            </p>
            <Field label="Co ma robić ten plugin?">
                <TextArea
                    rows={4}
                    value={description}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDescription(event.target.value)}
                    placeholder="Np. podswietl na czerwono linie zawierajace moje imie"
                    autoComplete="off"
                />
            </Field>
            <div className="popup-inline settings-wrap">
                <Button variant="solid" onClick={copy} disabled={!description.trim()}>
                    Kopiuj prompt
                </Button>
                <LinkButton href="https://claude.ai/new">Otwórz Claude</LinkButton>
                <LinkButton href="https://chatgpt.com/">Otwórz ChatGPT</LinkButton>
                {copied && <span className="popup-field__success">Skopiowano do schowka!</span>}
            </div>
            </div>
        </SubDialog>
    );
}
