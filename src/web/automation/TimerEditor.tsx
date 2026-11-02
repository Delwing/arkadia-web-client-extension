import { useEffect, useState } from "react";
import { Input, InputGroup, Segmented } from "@web-ui/primitives/index.ts";
import type { UserMacro } from "@client/scripts/userTriggers";
import { MAX_TIMER_SECONDS, MIN_TIMER_SECONDS, timerLabel, type UserTimer } from "@client/scripts/userTimers";
import type { CustomSound } from "@modules/core/customSounds";
import { ActionList } from "./ActionList";
import { CharacterScope, CharacterScopeSwitch, ItemUsers, Section } from "./EditorParts";
import type { AutomationItem } from "./automationModel";

type Part = "h" | "min" | "s";

const PARTS: { part: Part; seconds: number; title: string }[] = [
    { part: "h", seconds: 3600, title: "Godziny" },
    { part: "min", seconds: 60, title: "Minuty" },
    { part: "s", seconds: 1, title: "Sekundy" },
];

/** 5400.5 s as the fields show it: 1 h 30 min 0,5 s, a zero field left empty. */
function splitSeconds(total: number): Record<Part, string> {
    const valid = Number.isFinite(total) && total > 0 ? total : 0;
    const h = Math.floor(valid / 3600);
    const min = Math.floor((valid % 3600) / 60);
    const s = Math.round((valid % 60) * 1000) / 1000;
    const show = (n: number) => (n ? String(n).replace(".", ",") : "");
    return { h: show(h), min: show(min), s: show(s) };
}

/** "1,5" or "1.5"; empty is 0, anything else NaN, which the save check turns down. */
function parseAmount(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    const value = Number(trimmed.replace(",", "."));
    return Number.isFinite(value) && value >= 0 ? value : NaN;
}

/** The fields in seconds; something that is not a number gives 0, which the save check turns down (JSON keeps no NaN). */
function totalOf(parts: Record<Part, string>): number {
    const total = PARTS.reduce((sum, p) => sum + parseAmount(parts[p.part]) * p.seconds, 0);
    return Number.isFinite(total) ? Math.round(total * 1000) / 1000 : 0;
}

export function TimerEditor({ timer, users, onChange, onSelect, sounds, onRequestSoundUpload }: {
    timer: UserTimer;
    /** The elements whose actions start or stop it. */
    users: AutomationItem[];
    onChange: (timer: UserTimer) => void;
    onSelect: (id: string) => void;
    sounds: CustomSound[];
    onRequestSoundUpload: () => Promise<string | undefined>;
}) {
    // What is typed, kept as text so "1," on the way to "1,5" stays put.
    const [parts, setParts] = useState(() => splitSeconds(timer.seconds));
    const set = (patch: Partial<UserTimer>) => onChange({ ...timer, ...patch });
    const byAction = timer.start === "action";

    // Seconds changed from outside the fields (reverted, saved elsewhere, synced): show them.
    useEffect(() => {
        if (totalOf(parts) !== timer.seconds) setParts(splitSeconds(timer.seconds));
        // Only when the stored value moves; typing keeps the two equal.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timer.seconds]);

    const changePart = (part: Part, text: string) => {
        const next = { ...parts, [part]: text };
        setParts(next);
        set({ seconds: totalOf(next) });
    };

    return (
        <>
            <Section
                step={1}
                title="Kiedy"
                extra={
                    <Segmented<"every" | "once">
                        value={timer.once ? "once" : "every"}
                        options={[
                            { value: "every", label: "Co jakiś czas" },
                            { value: "once", label: "Raz, po czasie" },
                        ]}
                        onChange={mode => set({ once: mode === "once" ? true : undefined })}
                    />
                }
            >
                <div className="automation-timer">
                    <span className="automation-timer__word">{timer.once ? "Raz, po" : "Co"}</span>
                    {PARTS.map(p => (
                        <span key={p.part} className="automation-timer__part">
                            <InputGroup after={p.part}>
                                <Input
                                    className="automation-timer__amount"
                                    inputMode={p.part === "s" ? "decimal" : "numeric"}
                                    title={p.title}
                                    placeholder="0"
                                    value={parts[p.part]}
                                    onChange={e => changePart(p.part, e.target.value)}
                                    // 90 min reads back as 1 h 30 min once the field is left.
                                    onBlur={() => { if (timer.seconds > 0) setParts(splitSeconds(timer.seconds)); }}
                                    onFocus={e => e.currentTarget.select()}
                                />
                            </InputGroup>
                        </span>
                    ))}
                    <span className="automation-chip">{timerLabel(timer)}</span>
                </div>
                <span className="automation-cap">Start</span>
                <div className="automation-users">
                    <Segmented<"auto" | "action">
                        value={byAction ? "action" : "auto"}
                        options={[
                            { value: "auto", label: "Sam, po wejściu do gry" },
                            { value: "action", label: "Akcją z triggera lub aliasu" },
                        ]}
                        onChange={start => set({ start: start === "action" ? "action" : undefined })}
                    />
                    <ItemUsers users={users} onSelect={onSelect} />
                </div>
                <p className="automation-hint">
                    {byAction
                        ? <>Odlicza dopiero, gdy uruchomi go akcja „Uruchom / zatrzymaj timer” w triggerze, aliasie albo
                            innym timerze. Kolejne uruchomienie liczy od zera; {timer.once ? "po wykonaniu akcji czeka na następne." : "odlicza, dopóki akcja go nie zatrzyma."}
                            {users.length === 0 && " Na razie nic go nie uruchamia."}</>
                        : <>Odlicza, gdy postać jest w grze, od zera po wejściu do gry, po włączeniu (jego albo jego
                            grupy) i po zapisaniu zmian. {timer.once ? "Wykona akcje raz na każde takie włączenie." : "Wykonuje akcje, dopóki go nie wyłączysz."}
                            {" "}Akcja „Uruchom / zatrzymaj timer” zacznie odliczanie od nowa albo go zatrzyma.</>}
                    {" "}Czas: od {MIN_TIMER_SECONDS} s do {MAX_TIMER_SECONDS / 3600} h.
                </p>
            </Section>

            <Section step={2} title="Co zrobić" extra={<span className="popup-badge">{timer.macros.length}</span>}>
                <ActionList
                    macros={timer.macros}
                    onChange={(macros: UserMacro[]) => set({ macros })}
                    newMacro={() => ({ type: "command", command: "" })}
                    lineless
                    placeholders={[]}
                    commandPlaceholder="np. napij sie wody"
                    sounds={sounds}
                    onRequestSoundUpload={onRequestSoundUpload}
                    pluginMacros={[]}
                />
            </Section>

            <Section
                step={3}
                title="Dla kogo"
                extra={<CharacterScopeSwitch value={timer.characters} onChange={characters => set({ characters })} />}
            >
                <CharacterScope value={timer.characters} onChange={characters => set({ characters })} />
            </Section>
        </>
    );
}
