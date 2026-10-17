import { useCallback, useLayoutEffect, useRef, type InputHTMLAttributes, type MouseEvent, type ReactNode, type Ref, type RefObject } from "react";
import { openMenuAt } from "./EditorParts";
import { PATTERN_SNIPPETS, nextGroupIndex, type PatternSnippet } from "./patternSnippets";
import { groupColorClass, textPieces, type GroupRange, type RegexGroup, type TextPiece } from "./regexGroups";

function groupTitle(group: GroupRange): string {
    return group.name ? `Grupa ${group.index}: ${group.name}` : `Grupa ${group.index}`;
}

function Pieces({ pieces }: { pieces: TextPiece[] }) {
    return (
        <>
            {pieces.map((p, i) => "text" in p ? <span key={i}>{p.text}</span> : (
                <span key={i} className={`automation-grp ${groupColorClass(p.group.index)}`}>
                    <Pieces pieces={p.pieces} />
                </span>
            ))}
        </>
    );
}

/** What the backdrop copies from the input, so its text sits exactly under the input's. */
const MIRRORED = [
    "paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth",
    "fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "wordSpacing", "textIndent",
] as const;

/**
 * A text input with groups tinted in their colours over its own text. The
 * tints are a layer laid over the input that copies its font and padding and
 * follows its horizontal scroll; the text itself stays the input's, so typing,
 * selecting and the caret are untouched.

 */
export function HighlightInput({ ranges, inputRef, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & {
    ranges: GroupRange[];
    inputRef?: Ref<HTMLInputElement>;
}) {
    const input = useRef<HTMLInputElement | null>(null);
    const backdrop = useRef<HTMLDivElement>(null);
    const text = useRef<HTMLDivElement>(null);
    const value = String(rest.value ?? "");

    const follow = useCallback(() => {
        if (input.current && text.current) text.current.style.transform = `translateX(${-input.current.scrollLeft}px)`;
    }, []);

    useLayoutEffect(() => {
        const el = input.current;
        const back = backdrop.current;
        if (!el || !back) return;
        const style = getComputedStyle(el);
        for (const prop of MIRRORED) back.style[prop] = style[prop];
        follow();
    });

    const setRef = (el: HTMLInputElement | null) => {
        input.current = el;
        if (typeof inputRef === "function") inputRef(el);
        else if (inputRef) inputRef.current = el;
    };

    return (
        <span className="automation-hl">
            <input
                ref={setRef}
                className={className}
                {...rest}
                onScroll={e => { follow(); rest.onScroll?.(e); }}
                onKeyUp={e => { follow(); rest.onKeyUp?.(e); }}
                onSelect={e => { follow(); rest.onSelect?.(e); }}
            />
            {ranges.length > 0 && (
                <div ref={backdrop} className="automation-hl__backdrop">
                    <div ref={text} className="automation-hl__text">
                        <Pieces pieces={textPieces(value, ranges)} />
                    </div>
                </div>
            )}
        </span>
    );
}

const SNIPPET_SECTION: Record<PatternSnippet["kind"], string> = { capture: "", helper: "Pomocnicze", anchor: "Linia" };

/**
 * The button that opens the menu of ready pattern pieces. Inserts at the
 * caret of `input` (replacing what is selected there), then puts the caret
 * back, or selects what is meant to be typed over (a group's name).
 *
 * Each capture is shown in the colour of the group number it will get, so the
 * menu already says which `$N` it becomes. `kind` picks the pieces that make
 * sense there (see `PatternSnippet.only`).
 */
export function SnippetMenu({ input, value, onChange, kind, className, children }: {
    input: RefObject<HTMLInputElement | null>;
    value: string;
    onChange: (value: string) => void;
    kind: "alias" | "trigger";
    className: string;
    children: ReactNode;
}) {
    const open = (e: MouseEvent<HTMLElement>) => {
        const el = input.current;
        const start = el?.selectionStart ?? value.length;
        const end = el?.selectionEnd ?? start;
        const n = nextGroupIndex(value, start);
        const color = groupColorClass(n);
        openMenuAt(e, PATTERN_SNIPPETS.filter(s => !s.only || s.only === kind).map(s => {
            const makesGroup = s.kind === "capture" || s.id === "named";
            return {
                label: (
                    <span className="automation-snippet">
                        <span>{s.label}</span>
                        <code className={`automation-grp-tok${makesGroup ? ` ${color}` : ""}`}>{s.shown}</code>
                    </span>
                ),
                detail: s.detail,
                section: s.kind === "capture" ? `Grupa - trafi do $${n}` : SNIPPET_SECTION[s.kind],
                action: () => {
                    const result = s.apply(value, start, end);
                    onChange(result.value);
                    // After React has put the new value in, so the selection lands in it.
                    requestAnimationFrame(() => {
                        const field = input.current;
                        if (!field) return;
                        field.focus();
                        field.setSelectionRange(result.selStart, result.selEnd);
                    });
                },
            };
        }));
    };
    return (
        <button type="button" className={className} title="Wstaw do wzorca: słowo, liczbę, dowolny tekst..." onClick={open}>
            {children}
        </button>
    );
}

/** What each group took from the test text, in the group's colour: number, name if any, value. */
export function GroupValues({ groups, match }: { groups: RegexGroup[]; match: RegExpMatchArray }) {
    return (
        <>
            {groups.filter(g => match[g.index] !== undefined).map(g => (
                <span key={g.index} className={`automation-test__group ${groupColorClass(g.index)}`} title={groupTitle(g)}>
                    <span className="automation-grp-tok">${g.index}{g.name && <span className="automation-grp-tok__name">{`{${g.name}}`}</span>}</span>
                    {match[g.index]}
                </span>
            ))}
        </>
    );
}

/** Tokens in the actions that point at nothing, with why. Nothing when there are none. */
export function UnknownTokens({ tokens, why }: { tokens: string[]; why: string }) {
    if (!tokens.length) return null;
    return (
        <p className="automation-unknown">
            {tokens.map(t => <span key={t} className="automation-grp-tok is-unknown">{t}</span>)}
            <span>{why}</span>
        </p>
    );
}
