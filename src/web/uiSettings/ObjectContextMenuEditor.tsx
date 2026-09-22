import { useRef, useState } from "react";

interface ObjectContextMenuEditorProps {
    commands: string[];
    onChange: (commands: string[]) => void;
}

/**
 * Controlled chip/badge editor for the object context-menu commands.
 * Replaces the former imperative DOM badge editor.
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
    const isTyping = len > 0;

    return (
        <div
            id="ui-object-context-menu-container"
            className="popup-chips"
            onClick={() => inputRef.current?.focus()}
        >
            {commands.map(cmd => (
                <span
                    key={cmd}
                    className={`popup-chip context-menu-badge${flashing === cmd ? ' duplicate-flash' : ''}`}
                    onClick={(e) => { e.stopPropagation(); remove(cmd); }}
                    title="Usuń"
                >
                    {cmd}
                    <span className="popup-chip__remove">×</span>
                </span>
            ))}
            <span
                data-settings-ignore
                className={`context-menu-input-wrapper${isTyping ? ' popup-chip' : ''}`}
            >
                <input
                    type="text"
                    id="ui-object-context-menu-input"
                    ref={inputRef}
                    className="popup-chips__input"
                    value={inputValue}
                    placeholder={isTyping ? '' : '+'}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={commit}
                    style={{ width: isTyping ? `${len}ch` : '1ch' }}
                />
                {isTyping && (
                    <span
                        className="popup-chip__remove"
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setInputValue(''); inputRef.current?.focus(); }}
                    >
                        ×
                    </span>
                )}
            </span>
        </div>
    );
}

export default ObjectContextMenuEditor;
