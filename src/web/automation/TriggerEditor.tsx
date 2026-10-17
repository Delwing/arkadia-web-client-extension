import type { MouseEvent } from "react";
import { useRef, useState } from "react";
import { ArrowUp, Braces, ChevronDown, FlaskConical } from "lucide-react";
import { NO_PASSWORD_MANAGER, Segmented, Select } from "@web-ui/primitives/index.ts";
import {
    LINELESS_MACRO_TYPES,
    SUPPORTED_EVENTS,
    type TriggerType,
    type UserMacro,
    type UserTrigger,
} from "@client/scripts/userTriggers";
import type { CustomSound } from "@modules/core/customSounds";
import type { PluginTriggerMacro } from "@modules/core/pluginTriggerMacroRegistry";
import { getRecentLines } from "@modules/core/recentLines";
import { ActionList } from "./ActionList";
import { CharacterScope, CharacterScopeSwitch, Section, openMenuAt } from "./EditorParts";
import { ConditionsEditor, EventPicker, FlagToggles, GMCP_MSG_TYPES } from "./TriggerSource";
import { MatchStatus, OutputLine } from "./AliasEditor";
import { previewTrigger, testTriggerPattern } from "./automationPreview";
import { GroupValues, HighlightInput, SnippetMenu, UnknownTokens } from "./GroupParts";
import { patternFromText } from "./patternSnippets";
import {
    groupPlaceholders,
    macroTexts,
    matchRanges,
    missingGroupWhy,
    patternGroups,
    unknownArgTokens,
    unknownGroupTokens,
} from "./regexGroups";

const TYPE_OPTIONS: { value: TriggerType; label: string }[] = [
    { value: "pattern", label: "Tekst gry" },
    { value: "event", label: "Zdarzenie" },
];

/** How many recent game lines the "z ostatnich linii" menu offers. */
const RECENT_OFFERED = 15;

export function TriggerEditor({ trigger, onChange, sounds, onRequestSoundUpload, pluginMacros }: {
    trigger: UserTrigger;
    onChange: (trigger: UserTrigger) => void;
    sounds: CustomSound[];
    onRequestSoundUpload: () => Promise<string | undefined>;
    pluginMacros: PluginTriggerMacro[];
}) {
    const [sample, setSample] = useState("");
    const patternInput = useRef<HTMLInputElement>(null);
    const isEvent = trigger.type === "event";
    const pattern = trigger.pattern ?? "";
    const flags = trigger.flags ?? "";
    const set = (patch: Partial<UserTrigger>) => onChange({ ...trigger, ...patch });

    const changeType = (type: TriggerType) => {
        // Actions that edit a line make no sense on an event; plugin macros are kept.
        const macros = type === "event"
            ? trigger.macros.filter(m => LINELESS_MACRO_TYPES.has(m.type) || m.type.startsWith("plugin:"))
            : trigger.macros;
        set({ type, macros });
    };

    const selectedEvent = isEvent ? SUPPORTED_EVENTS.find(e => e.id === trigger.event) : undefined;
    const eventArgs = selectedEvent?.args ?? [];
    // Conditions left over from a previously picked event reference fields this
    // one does not carry and could never pass; they are hidden and not saved.
    const conditions = (trigger.conditions ?? []).filter(c => eventArgs.some(a => a.name === c.arg));

    const test = isEvent ? { matches: [] } : testTriggerPattern(pattern, flags, sample);
    const preview = test.matches.length ? previewTrigger(sample, test.matches, trigger.macros) : null;
    const groups = isEvent ? [] : patternGroups(pattern);
    const placeholders = isEvent
        ? eventArgs.map(a => ({ token: `{${a.name}}`, label: a.label }))
        : [
            { token: "$0", label: "Całe dopasowanie" },
            ...groupPlaceholders(groups),
        ];
    const texts = trigger.macros.flatMap(m => macroTexts(m));
    // An event that declares no fields may still carry some, so only declared ones are checked.
    const unknown = isEvent
        ? eventArgs.length ? [...new Set(texts.flatMap(t => unknownArgTokens(t, eventArgs.map(a => a.name))))] : []
        : test.error ? [] : [...new Set(texts.flatMap(t => unknownGroupTokens(t, groups)))];

    const pickRecentLine = (e: MouseEvent<HTMLElement>) => {
        // Newest first, each text once, and only lines with words in them:
        // the game sends plenty of lone dots and blank prompts.
        const seen = new Set<string>();
        const lines = getRecentLines().reverse().filter(line => {
            if (seen.has(line.text) || !/[A-Za-z]{2}/.test(line.text)) return false;
            seen.add(line.text);
            return true;
        }).slice(0, RECENT_OFFERED);
        if (!lines.length) {
            openMenuAt(e, [{ label: "Brak linii z gry w tej sesji", action: () => {} }]);
            return;
        }
        const matches = (text: string) => testTriggerPattern(pattern, flags, text).matches.length > 0;
        openMenuAt(e, lines.map(line => ({
            label: line.text.length > 90 ? `${line.text.slice(0, 90)}...` : line.text,
            checked: !!pattern && matches(line.text),
            action: () => setSample(line.text),
        })));
    };

    const msgTypeKnown = !trigger.gmcpMsgType || GMCP_MSG_TYPES.some(t => t.id === trigger.gmcpMsgType);

    return (
        <>
            <Section step={1} title="Kiedy" extra={<Segmented value={isEvent ? "event" : "pattern"} options={TYPE_OPTIONS} onChange={changeType} />}>
                {isEvent ? (
                    <>
                        <EventPicker event={trigger.event ?? ""} onChange={event => set({ event })} />
                        {selectedEvent?.description && <p className="automation-hint">{selectedEvent.description}</p>}
                        {eventArgs.length > 0 && (
                            <ConditionsEditor conditions={conditions} onChange={c => set({ conditions: c })} args={eventArgs} />
                        )}
                    </>
                ) : (
                    <>
                        <div className="automation-field">
                            <HighlightInput
                                className="automation-field__input"
                                inputRef={patternInput}
                                ranges={groups}
                                autoComplete="off"
                                {...NO_PASSWORD_MANAGER}
                                title="Wzorzec"
                                spellCheck={false}
                                value={pattern}
                                placeholder="np. ^(\w+) atakuje cie"
                                onChange={e => set({ pattern: e.target.value })}
                            />
                            <SnippetMenu
                                input={patternInput}
                                value={pattern}
                                onChange={p => set({ pattern: p })}
                                kind="trigger"
                                className="automation-flag automation-insert"
                            >
                                <Braces size={14} />
                            </SnippetMenu>
                            <FlagToggles value={flags} onChange={f => set({ flags: f })} />
                        </div>
                        <div className="automation-test">
                            <FlaskConical size={14} className="automation-test__ic" />
                            <HighlightInput
                                className="automation-test__input"
                                ranges={matchRanges(test.matches, groups)}
                                autoComplete="off"
                                {...NO_PASSWORD_MANAGER}
                                title="Linia do testu"
                                spellCheck={false}
                                value={sample}
                                placeholder="Wklej linię z gry, żeby sprawdzić wzorzec"
                                onChange={e => setSample(e.target.value)}
                            />
                            {(sample || test.error) && <MatchStatus matched={test.matches.length > 0} error={test.error} />}
                            {test.matches[0] && <GroupValues groups={groups} match={test.matches[0]} />}
                            {sample.trim() && !test.matches.length && (
                                <button
                                    type="button"
                                    className="automation-link"
                                    title="Wpisz tę linię jako wzorzec - potem zaznacz w nim słowo i wstaw grupę"
                                    onClick={() => set({ pattern: patternFromText(sample, true) })}
                                >
                                    <ArrowUp size={13} />jako wzorzec
                                </button>
                            )}
                            <button type="button" className="automation-link" onClick={pickRecentLine}>
                                z ostatnich linii<ChevronDown size={13} />
                            </button>
                        </div>
                        <div className="automation-row">
                            <span className="automation-row__label">Tylko w</span>
                            <Select
                                className="automation-msgtype"
                                title="Typ wiadomości"
                                value={trigger.gmcpMsgType ?? ""}
                                onChange={e => set({ gmcpMsgType: e.target.value || undefined })}
                            >
                                <option value="">dowolnych wiadomościach</option>
                                {!msgTypeKnown && <option value={trigger.gmcpMsgType}>{trigger.gmcpMsgType}</option>}
                                {GMCP_MSG_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                            </Select>
                        </div>
                    </>
                )}
            </Section>

            <Section step={2} title="Co zrobić" extra={<span className="popup-badge">{trigger.macros.length}</span>}>
                <ActionList
                    macros={trigger.macros}
                    onChange={(macros: UserMacro[]) => set({ macros })}
                    newMacro={() => ({ type: "command", command: "" })}
                    lineless={isEvent}
                    placeholders={placeholders}
                    sounds={sounds}
                    onRequestSoundUpload={onRequestSoundUpload}
                    pluginMacros={pluginMacros}
                />
                <UnknownTokens
                    tokens={unknown}
                    why={isEvent ? "- tego pola nie ma w wybranym zdarzeniu." : missingGroupWhy(groups.length)}
                />
                {preview && (
                    <div className="automation-out">
                        <span className="automation-out__head">Wynik dla linii z testu:</span>
                        <span className="automation-out__line is-mono">
                            {preview.segments.map((s, i) => (
                                <span
                                    key={i}
                                    className={`${s.match ? "automation-out__match" : ""}${s.effect ? " is-effect" : ""}`}
                                    style={{
                                        color: s.color,
                                        backgroundColor: s.background,
                                        fontWeight: s.bold ? "bold" : undefined,
                                        fontStyle: s.italic ? "italic" : undefined,
                                        textDecoration: [s.underline && "underline", s.strikethrough && "line-through"].filter(Boolean).join(" ") || undefined,
                                    }}
                                >
                                    {s.text}
                                </span>
                            ))}
                        </span>
                        {preview.outputs.map((o, i) => <OutputLine key={i} output={o} />)}
                    </div>
                )}
            </Section>

            <Section
                step={3}
                title="Dla kogo"
                extra={<CharacterScopeSwitch value={trigger.characters} onChange={characters => set({ characters })} />}
            >
                <CharacterScope value={trigger.characters} onChange={characters => set({ characters })} />
            </Section>
        </>
    );
}
