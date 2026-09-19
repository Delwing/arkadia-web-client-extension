import { useRef, useState } from "react";

interface ObjectContextMenuEditorProps {
    commands: string[];
    onChange: (commands: string[]) => void;
}

/**
 * Controlled chip editor for the object context-menu commands. Part of
 * Interfejs > Okna, migrated onto the design system (UI_MIGRATION.md §4).
 *
 * Hand-rolled rather than built on `@design`'s `Chip`: that one is a Radix
 * Toggle for filter pills (pressed / not pressed) and has no remove
 * affordance, which is the only thing these chips do.
 *
 * The trailing input is marked `data-settings-ignore` — it is a scratch field
 * for typing the next command, not a setting, so it must stay out of the
 * page signature that raises the unsaved-changes dot.
 */
function ObjectContextMenuEditor({ commands, onChange }: ObjectContextMenuEditorProps) {
    const [inputValue, setInputValue] = useState("");
    const [flashing, setFlashing] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const flashTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const flashDuplicate = (cmd: string) => {
        setFlashing(cmd);
        if (flashTimeout.current) clearTimeout(flashTimeout.current);
        flashTimeout.current = setTimeout(() => setFlashing(null), 300);
    };

    const commit = () => {
        const val = inputValue.trim();
        if (val && !commands.includes(val)) {
            onChange([...commands, val]);
            setInputValue("");
            return true;
        }
        return false;
    };

    const remove = (cmd: string) => {
        onChange(commands.filter(c => c !== cmd));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            const val = inputValue.trim();
            if (val && !commands.includes(val)) {
                onChange([...commands, val]);
                setInputValue("");
            } else if (val) {
                flashDuplicate(val);
                setInputValue("");
            }
        } else if (e.key === 'Backspace' && inputValue === '' && commands.length > 0) {
            remove(commands[commands.length - 1]);
        }
    };

    const len = inputValue.length;

    return (
        <div
            id="ui-object-context-menu-container"
            className="settings-chips"
            onClick={() => inputRef.current?.focus()}
        >
            {commands.map(cmd => (
                <span
                    key={cmd}
                    className={`settings-chip settings-chip--button${flashing === cmd ? ' settings-chip--duplicate' : ''}`}
                    title="Kliknij, aby usunąć"
                    onClick={(e) => { e.stopPropagation(); remove(cmd); }}
                >
                    {cmd}
                    <span className="settings-chip__remove">{'×'}</span>
                </span>
            ))}
            <input
                type="text"
                id="ui-object-context-menu-input"
                data-settings-ignore
                ref={inputRef}
                className="settings-chip__input"
                // Grows with what is typed so the caret sits next to the text
                // rather than at the end of a fixed-width field.
                style={{ width: `${Math.max(len, 1)}ch` }}
                value={inputValue}
                placeholder={len > 0 ? '' : '+'}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={commit}
            />
        </div>
    );
}

export default ObjectContextMenuEditor;
