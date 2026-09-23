import type { MouseEvent, ReactNode } from "react";
import { useMemo } from "react";
import { Check, Segmented } from "@web-ui/primitives/index.ts";
import { showContextMenu, type ContextMenuEntry } from "@web/contextMenu";
import { collectCharacters } from "@web/options/exportUtils";

/** An on/off switch as a real button; its title names what it switches. */
export function Switch({ on, title, onChange, children }: {
    on: boolean;
    title: string;
    onChange: (on: boolean) => void;
    children?: ReactNode;
}) {
    return (
        <button
            type="button"
            className={`automation-switch${on ? " is-on" : ""}`}
            title={title}
            onClick={e => { e.stopPropagation(); onChange(!on); }}
        >
            <span className="popup-switch" />
            {children}
        </button>
    );
}

/** One numbered step of the editor: 1 Kiedy, 2 Co zrobic, 3 Dla kogo. */
export function Section({ step, title, extra, children }: {
    step: number;
    title: ReactNode;
    extra?: ReactNode;
    children?: ReactNode;
}) {
    return (
        <section className="automation-sec">
            <div className="automation-sec__head">
                <span className="automation-sec__step">{step}</span>
                <span className="automation-sec__title">{title}</span>
                {extra && <span className="automation-sec__extra">{extra}</span>}
            </div>
            {children}
        </section>
    );
}

/** Opens a context menu under the clicked button. */
export function openMenuAt(e: MouseEvent<HTMLElement>, items: ContextMenuEntry[]) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    showContextMenu(items, rect.left, rect.bottom + 4);
}

/** Known characters, plus any the element lists that are not known here (yet). */
export function useCharacters(listed: string[] = []): string[] {
    const known = useMemo(() => collectCharacters(), []);
    return [...known, ...listed.filter(c => !known.includes(c))];
}

/** "Dla kogo": every character, or the ticked ones. */
export function CharacterScope({ value, onChange }: {
    value: string[] | undefined;
    onChange: (characters: string[] | undefined) => void;
}) {
    const selected = value !== undefined;
    const characters = useCharacters(value ?? []);
    const toggle = (name: string, on: boolean) => {
        const current = value ?? [];
        onChange(on ? [...current, name] : current.filter(c => c !== name));
    };
    return (
        <>
            {selected && (
                characters.length ? (
                    <div className="automation-characters">
                        {characters.map(c => (
                            <Check key={c} label={c} checked={value!.includes(c)} onChange={e => toggle(c, e.target.checked)} />
                        ))}
                    </div>
                ) : (
                    <p className="automation-hint">Brak zapisanych postaci. Beda dostepne po zalogowaniu na postac.</p>
                )
            )}
            {selected && value!.length === 0 && characters.length > 0 && (
                <p className="automation-hint">Nie wybrano zadnej postaci - zapisze sie dla wszystkich.</p>
            )}
        </>
    );
}

export function CharacterScopeSwitch({ value, onChange }: {
    value: string[] | undefined;
    onChange: (characters: string[] | undefined) => void;
}) {
    return (
        <Segmented<"all" | "some">
            value={value !== undefined ? "some" : "all"}
            options={[
                { value: "all", label: "Wszystkie postacie" },
                { value: "some", label: "Wybrane" },
            ]}
            onChange={scope => onChange(scope === "all" ? undefined : value ?? [])}
        />
    );
}

/** Tokens that go into a text field, shown as small mono chips. */
export function Tokens({ tokens }: { tokens: { token: string; title: string }[] }) {
    return (
        <>
            {tokens.map(t => <span key={t.token} className="automation-tok" title={t.title}>{t.token}</span>)}
        </>
    );
}
