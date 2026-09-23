import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Play } from "lucide-react";
import { Button, Input, InputGroup, NO_PASSWORD_MANAGER } from "@web-ui/primitives/index.ts";
import eventBus from "@modules/core/eventBus";
import { clearScriptLog, getScriptLog, onScriptLog, type ScriptLogEntry } from "@modules/core/scriptConsole";
import type { UserScript } from "@client/scripts/userScripts";
import { CharacterScope, CharacterScopeSwitch, Section } from "./EditorParts";
import { itemTitle, type AutomationItem } from "./automationModel";

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

export function ScriptEditor({ id, script, users, onChange, onSelect }: {
    id: string;
    script: UserScript;
    /** The aliases and triggers that run it. */
    users: AutomationItem[];
    onChange: (script: UserScript) => void;
    onSelect: (id: string) => void;
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
                <CodeField value={script.code} onChange={code => onChange({ ...script, code })} />
                <p className="automation-hint">
                    <code>export default function (api, args, ctx)</code> — <code>api</code> to API wtyczek (Dokumentacja → Wtyczki),
                    <code> args</code> to grupy z wzorca, <code>ctx.log()</code> pisze do konsoli. Skrypt dziala raz na uruchomienie;
                    cos, co ma zostac zarejestrowane na stale, zrob jako wtyczke.
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
