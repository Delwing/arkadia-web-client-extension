import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Play } from "lucide-react";
import { Button, Input, InputGroup, NO_PASSWORD_MANAGER } from "@web-ui/primitives/index.ts";
import eventBus from "@modules/core/eventBus";
import { clearScriptLog, getScriptLog, onScriptLog, type ScriptLogEntry } from "@modules/core/scriptConsole";
import type { UserScript } from "@client/scripts/userScripts";
import { CharacterScope, CharacterScopeSwitch, Section } from "./EditorParts";
import { itemTitle, type AutomationItem } from "./automationModel";
import type { ScriptEditorHandle } from "./scriptMonaco";

const INDENT = "    ";

function time(at: number): string {
    return new Date(at).toLocaleTimeString("pl-PL", { hour12: false });
}

function useScriptLog(id: string): ScriptLogEntry[] {
    const [log, setLog] = useState(() => getScriptLog(id));
    useEffect(() => {
        setLog(getScriptLog(id));
        return onScriptLog(changed => { if (changed === id) setLog(getScriptLog(id)); });
    }, [id]);
    return log;
}

/** A plain code field with line numbers; Tab indents instead of leaving the field. */
function CodeField({ value, onChange }: { value: string; onChange: (code: string) => void }) {
    const gutter = useRef<HTMLDivElement>(null);
    const lines = value.split("\n").length;

    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key !== "Tab" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
        e.preventDefault();
        const el = e.currentTarget;
        const { selectionStart: start, selectionEnd: end } = el;
        onChange(value.slice(0, start) + INDENT + value.slice(end));
        requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + INDENT.length; });
    };

    return (
        <div className="automation-code">
            <div className="automation-code__gutter" ref={gutter}>
                {Array.from({ length: lines }, (_, i) => <span key={i}>{i + 1}</span>)}
            </div>
            <textarea
                className="automation-code__text"
                title="Kod skryptu"
                value={value}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                wrap="off"
                {...NO_PASSWORD_MANAGER}
                onChange={e => onChange(e.target.value)}
                onKeyDown={onKeyDown}
                onScroll={e => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
            />
        </div>
    );
}

/**
 * Monaco with completion from the plugin API types, loaded when the first
 * script is opened. Until it arrives, if it fails, and on touch screens (where
 * Monaco is hard to use) the plain field stands in.
 */
function ScriptCodeEditor({ value, onChange, onSave }: {
    value: string;
    onChange: (code: string) => void;
    onSave: () => void;
}) {
    const [mode, setMode] = useState<"loading" | "monaco" | "plain">(() =>
        window.matchMedia?.("(pointer: coarse)").matches ? "plain" : "loading");
    const host = useRef<HTMLDivElement>(null);
    const handle = useRef<ScriptEditorHandle | null>(null);
    const latest = useRef({ value, onChange, onSave });
    latest.current = { value, onChange, onSave };

    useEffect(() => {
        if (mode !== "loading") return;
        let cancelled = false;
        import("./scriptMonaco")
            .then(({ createScriptEditor }) => {
                if (cancelled || !host.current) return;
                handle.current = createScriptEditor(host.current, {
                    value: latest.current.value,
                    onChange: code => latest.current.onChange(code),
                    onSave: () => latest.current.onSave(),
                });
                setMode("monaco");
            })
            .catch(err => {
                console.error("[automation] Monaco failed to load, using the plain editor", err);
                if (!cancelled) setMode("plain");
            });
        return () => {
            cancelled = true;
            handle.current?.dispose();
            handle.current = null;
        };
        // Once per mount; the editor is remounted for another script.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // A change from outside (Cofnij zmiany) reaches the editor too.
    useEffect(() => { handle.current?.setValue(value); }, [value]);

    return (
        <>
            {mode !== "monaco" && <CodeField value={value} onChange={onChange} />}
            <div ref={host} className="automation-monaco" hidden={mode !== "monaco"} title="Kod skryptu" />
        </>
    );
}

export function ScriptEditor({ id, script, users, onChange, onSelect, onSave }: {
    id: string;
    script: UserScript;
    /** The aliases and triggers that run it. */
    users: AutomationItem[];
    onChange: (script: UserScript) => void;
    onSelect: (id: string) => void;
    /** Ctrl+Enter in the code editor. */
    onSave: () => void;
}) {
    const log = useScriptLog(id);
    const consoleEnd = useRef<HTMLDivElement>(null);
    useEffect(() => { consoleEnd.current?.scrollIntoView({ block: "nearest" }); }, [log.length]);

    return (
        <>
            <Section step={1} title="Kiedy uruchamiany przez">
                <div className="automation-users">
                    {users.map(u => {
                        const title = itemTitle(u);
                        return (
                            <button key={u.id} type="button" className="automation-user" title="Pokaz ten element" onClick={() => onSelect(u.id)}>
                                <span className={`automation-user__kind automation-user__kind--${u.kind}`}>{u.kind === "alias" ? "alias" : "wyzwalacz"}</span>
                                <span className={title.mono ? "is-mono" : undefined}>{title.prefix ? `${title.prefix} ` : ""}{title.text}</span>
                            </button>
                        );
                    })}
                    <InputGroup before="/">
                        <Input
                            mono
                            title="Komenda"
                            value={script.command ?? ""}
                            placeholder="komenda (opcjonalna)"
                            onChange={e => onChange({ ...script, command: e.target.value || undefined })}
                        />
                    </InputGroup>
                </div>
                <p className="automation-hint">
                    Dodajesz go jako akcje „Uruchom skrypt” w dowolnym aliasie lub wyzwalaczu. Z komenda uruchomisz go tez sam,
                    np. <code>/{script.command?.trim() || "leczenie"} goblin</code> — slowa po komendzie trafia do <code>args</code>.
                </p>
            </Section>

            <Section
                step={2}
                title="Kod JavaScript"
                extra={
                    <Button
                        size="sm"
                        title="Uruchom teraz (takze niezapisany kod)"
                        onClick={() => eventBus.emit("automation.runScript", { id, code: script.code })}
                    >
                        <Play size={13} />Uruchom
                    </Button>
                }
            >
                <ScriptCodeEditor value={script.code} onChange={code => onChange({ ...script, code })} onSave={onSave} />
                <p className="automation-hint">
                    Piszesz od razu kod: pod reka sa <code>args</code> (grupy z wzorca, $1 to <code>args[0]</code>),
                    <code> api</code> (API wtyczek), <code>ctx</code> i skroty <code>log()</code>, <code>send()</code>, <code>print()</code>,
                    <code> gmcp</code>, a czesci API bez <code>api.</code> na poczatku: <code>command.send()</code>, <code>map</code>,
                    <code> team</code>... Dane dla innych skryptow zostaw w <code>vars</code> (np. <code>vars.cel = args[0]</code>),
                    wspolnym dla wszystkich skryptow do przeladowania strony. Mozna uzyc <code>await</code> i <code>return</code>, a biblioteke z sieci wczytac przez
                    <code> await import('https://esm.sh/...')</code>. Skrypt dziala raz na uruchomienie; cos, co ma zostac
                    zarejestrowane na stale, zrob jako wtyczke.
                </p>
                <div className="automation-console">
                    <div className="automation-console__head">
                        <span className="automation-cap">Konsola</span>
                        <span className="automation-spacer" />
                        <button type="button" className="automation-link" disabled={!log.length} onClick={() => clearScriptLog(id)}>Wyczysc</button>
                    </div>
                    <div className="automation-console__lines">
                        {log.length === 0 && <span className="automation-console__empty">Tu pojawi sie to, co skrypt zrobi.</span>}
                        {log.map((entry, i) => (
                            <span key={i} className={`automation-console__line is-${entry.kind}`}>
                                <span className="automation-console__time">{time(entry.at)}</span>
                                {entry.kind === "send" ? `→ ${entry.text}` : entry.text}
                            </span>
                        ))}
                        <div ref={consoleEnd} />
                    </div>
                </div>
            </Section>

            <Section
                step={3}
                title="Dla kogo"
                extra={<CharacterScopeSwitch value={script.characters} onChange={characters => onChange({ ...script, characters })} />}
            >
                <CharacterScope value={script.characters} onChange={characters => onChange({ ...script, characters })} />
            </Section>
        </>
    );
}
