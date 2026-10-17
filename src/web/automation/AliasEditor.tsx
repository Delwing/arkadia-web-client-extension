import { useRef, useState } from "react";
import { ArrowRight, ArrowUp, Bell, Braces, Check as CheckIcon, Code2, FlaskConical, Folder, MessageSquareText, Smartphone, Volume2, X } from "lucide-react";
import { Button, DeleteButton, Input, InputGroup, NO_PASSWORD_MANAGER, Select } from "@web-ui/primitives/index.ts";
import { aliasActions, type UserAlias } from "@client/scripts/userAliases";
import type { UserMacro } from "@client/scripts/userTriggers";
import type { CustomSound } from "@modules/core/customSounds";
import { characterStorage } from "@modules/core/storage";
import { ActionList } from "./ActionList";
import { CharacterScope, CharacterScopeSwitch, Section, useCharacters } from "./EditorParts";
import { previewAlias, testAliasPattern, type PreviewOutput } from "./automationPreview";
import { GroupValues, HighlightInput, SnippetMenu, UnknownTokens } from "./GroupParts";
import { patternFromText } from "./patternSnippets";
import { groupPlaceholders, macroTexts, matchRanges, missingGroupWhy, patternGroups, unknownGroupTokens } from "./regexGroups";

/** What the Input primitive puts on a code field, for the highlighted one that cannot use it. */
const CODE_FIELD = {
    ...NO_PASSWORD_MANAGER,
    type: "text",
    autoCorrect: "off",
    autoComplete: "off",
    autoCapitalize: "off",
    spellCheck: false,
    className: "popup-input popup-input--control popup-input--mono",
} as const;

const OUTPUT_ICON: Partial<Record<PreviewOutput["kind"], typeof ArrowRight>> = {
    notify: Bell,
    push: Smartphone,
    speak: Volume2,
    echo: MessageSquareText,
    sound: Volume2,
    script: Code2,
    group: Folder,
};

export function OutputLine({ output }: { output: PreviewOutput }) {
    const Icon = OUTPUT_ICON[output.kind] ?? ArrowRight;
    return (
        <span className={`automation-out__line${output.kind === "command" || output.kind === "bind" ? " is-mono" : ""}`}>
            <Icon size={13} className="automation-out__ic" />{output.text}
        </span>
    );
}

export function MatchStatus({ matched, error }: { matched: boolean; error?: string }) {
    if (error) return <span className="automation-chip is-bad" title={error}><X size={13} />błąd we wzorcu</span>;
    return matched
        ? <span className="automation-chip is-ok"><CheckIcon size={13} />pasuje</span>
        : <span className="automation-chip">nie pasuje</span>;
}

export function AliasEditor({ alias, onChange, sounds, onRequestSoundUpload }: {
    alias: UserAlias;
    onChange: (alias: UserAlias) => void;
    sounds: CustomSound[];
    onRequestSoundUpload: () => Promise<string | undefined>;
}) {
    const [sample, setSample] = useState("");
    const patternInput = useRef<HTMLInputElement>(null);
    const [addChar, setAddChar] = useState("");
    const actions = aliasActions(alias);
    const setActions = (macros: UserMacro[]) => onChange({ ...alias, macros });

    const pattern = alias.pattern.trim();
    const test = testAliasPattern(pattern, sample.trim());
    const lead = sample.length - sample.trimStart().length;
    const match = test.matches[0];
    const groups = patternGroups(pattern);
    const placeholders = groupPlaceholders(groups);
    const unknown = test.error ? [] : [...new Set(actions.flatMap(m => macroTexts(m)).flatMap(t => unknownGroupTokens(t, groups)))];

    const overrides = Object.entries(alias.overrides ?? {});
    const characters = useCharacters(overrides.map(([c]) => c));
    const available = characters.filter(c => !(c in (alias.overrides ?? {})));
    const setOverrides = (entries: [string, string][]) =>
        onChange({ ...alias, overrides: entries.length ? Object.fromEntries(entries) : undefined });

    const character = characterStorage.getCharacter();
    const override = character ? alias.overrides?.[character]?.trim() : undefined;
    const outputs = match ? previewAlias(match, actions, override || undefined) : [];

    return (
        <>
            <Section step={1} title="Kiedy wpiszesz">
                <div className="automation-pattern">
                    <InputGroup before="^" after="$">
                        <HighlightInput
                            {...CODE_FIELD}
                            inputRef={patternInput}
                            ranges={patternGroups(alias.pattern)}
                            title="Wzorzec"
                            value={alias.pattern}
                            placeholder="np. zab (.+)"
                            onChange={e => onChange({ ...alias, pattern: e.target.value })}
                        />
                    </InputGroup>
                    <SnippetMenu
                        input={patternInput}
                        value={alias.pattern}
                        onChange={pattern => onChange({ ...alias, pattern })}
                        kind="alias"
                        className="popup-btn popup-btn--icon"
                    >
                        <Braces size={15} />
                    </SnippetMenu>
                </div>
                <div className="automation-test">
                    <FlaskConical size={14} className="automation-test__ic" />
                    <HighlightInput
                        // The sample is matched trimmed; ranges are offsets into it.
                        ranges={match ? matchRanges([match], groups).map(r => ({ ...r, start: r.start + lead, end: r.end + lead })) : []}
                        className="automation-test__input"
                        autoComplete="off"
                        {...NO_PASSWORD_MANAGER}
                        title="Przykładowa komenda"
                        spellCheck={false}
                        value={sample}
                        placeholder="Wpisz przykładową komendę, np. zab goblina"
                        onChange={e => setSample(e.target.value)}
                    />
                    {(sample.trim() || test.error) && <MatchStatus matched={!!match} error={test.error} />}
                    {match && <GroupValues groups={groups} match={match} />}
                    {sample.trim() && !match && (
                        <button
                            type="button"
                            className="automation-link"
                            title="Wpisz tę komendę jako wzorzec - potem zaznacz w nim słowo i wstaw grupę"
                            onClick={() => onChange({ ...alias, pattern: patternFromText(sample, false) })}
                        >
                            <ArrowUp size={13} />jako wzorzec
                        </button>
                    )}
                </div>
            </Section>

            <Section step={2} title="Co zrobić" extra={<span className="popup-badge">{actions.length}</span>}>
                <ActionList
                    macros={actions}
                    onChange={setActions}
                    newMacro={() => ({ type: "command", command: "" })}
                    lineless
                    placeholders={placeholders}
                    commandPlaceholder="np. zabij $1"
                    sounds={sounds}
                    onRequestSoundUpload={onRequestSoundUpload}
                    pluginMacros={[]}
                />
                <UnknownTokens tokens={unknown} why={missingGroupWhy(groups.length)} />
                <div className="automation-legend">
                    <span><span className="automation-tok">$1</span>grupa z wzorca, $2 kolejna</span>
                    <span><span className="automation-tok">{"{cel}"}</span>grupa nazwana: <code>{"(?<cel>.+)"}</code></span>
                    <span><span className="automation-tok">@1</span>obiekt: @1, @A, @@</span>
                    <span><span className="automation-tok">$i</span>zakres: <code>kok 1-7</code></span>
                    <span><span className="automation-tok">;</span>kilka komend w jednym polu</span>
                </div>
                {match && (
                    <div className="automation-out">
                        <span className="automation-out__head">
                            Dla <code>{sample.trim()}</code>{override ? ` (jako ${character})` : ""}:
                        </span>
                        {outputs.length
                            ? outputs.map((o, i) => <OutputLine key={i} output={o} />)
                            : <span className="automation-out__line">nic</span>}
                    </div>
                )}
            </Section>

            <Section
                step={3}
                title="Dla kogo"
                extra={<CharacterScopeSwitch value={alias.characters} onChange={characters => onChange({ ...alias, characters })} />}
            >
                <CharacterScope value={alias.characters} onChange={characters => onChange({ ...alias, characters })} />
                <span className="automation-cap">Inaczej dla postaci</span>
                <div className="automation-overrides">
                    {overrides.map(([char, cmd]) => (
                        <div key={char} className="automation-override">
                            <span className="automation-override__who">
                                <span className="automation-avatar">{char.slice(0, 1).toUpperCase()}</span>{char}
                            </span>
                            <Input
                                mono
                                title={`Komenda dla ${char}`}
                                spellCheck={false}
                                value={cmd}
                                placeholder="Komenda dla tej postaci"
                                onChange={e => setOverrides(overrides.map(([c, v]) => [c, c === char ? e.target.value : v]))}
                            />
                            <DeleteButton title="Usuń nadpisanie" onClick={() => setOverrides(overrides.filter(([c]) => c !== char))} />
                        </div>
                    ))}
                    {available.length > 0 ? (
                        <div className="automation-override automation-override--add">
                            <Select
                                className="automation-override__select"
                                title="Postać"
                                value={addChar || available[0]}
                                onChange={e => setAddChar(e.target.value)}
                            >
                                {available.map(c => <option key={c} value={c}>{c}</option>)}
                            </Select>
                            <Button onClick={() => { setOverrides([...overrides, [addChar || available[0], ""]]); setAddChar(""); }}>
                                Dodaj dla postaci
                            </Button>
                        </div>
                    ) : characters.length === 0 ? (
                        <p className="automation-hint">Brak zapisanych postaci. Nadpisania będą dostępne po zalogowaniu na postać.</p>
                    ) : null}
                </div>
                <p className="automation-hint">Zastępuje wszystkie komendy z punktu 2 dla tej postaci.</p>
            </Section>
        </>
    );
}
