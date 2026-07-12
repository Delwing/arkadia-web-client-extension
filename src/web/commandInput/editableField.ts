/**
 * A single editable text field, reduced to just the operations the command-line
 * engine needs. This is the seam that lets the engine run over *any* UI's input
 * element — the stock web `<textarea>`, an forge-ui React `<textarea>`, or a fake
 * in a unit test — without the engine ever touching the DOM directly.
 *
 * A native `HTMLInputElement`/`HTMLTextAreaElement` already satisfies almost all
 * of this (React refs hand you the real DOM node), so `domEditableField` is a
 * thin wrapper; tests supply a plain-object implementation instead.
 */
export interface EditableField {
    value: string;
    readonly selectionStart: number;
    readonly selectionEnd: number;
    setSelection(start: number, end: number): void;
    focus(): void;
    isFocused(): boolean;
}

/** Wrap a real DOM input/textarea as an `EditableField`. */
export function domEditableField(el: HTMLInputElement | HTMLTextAreaElement): EditableField {
    return {
        get value(): string {
            return el.value;
        },
        set value(v: string) {
            el.value = v;
        },
        get selectionStart(): number {
            return el.selectionStart ?? 0;
        },
        get selectionEnd(): number {
            return el.selectionEnd ?? el.value.length;
        },
        setSelection(start: number, end: number): void {
            el.setSelectionRange(start, end);
        },
        focus(): void {
            el.focus();
        },
        isFocused(): boolean {
            return typeof document !== 'undefined' && document.activeElement === el;
        },
    };
}
