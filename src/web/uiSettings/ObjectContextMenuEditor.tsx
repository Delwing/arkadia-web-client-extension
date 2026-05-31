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
            className="form-control form-control-sm d-inline-flex flex-wrap align-items-center"
            style={{ height: 'auto', cursor: 'text', padding: '0.2rem 0.4rem', gap: '0.2rem' }}
            onClick={() => inputRef.current?.focus()}
        >
            {commands.map(cmd => (
                <span
                    key={cmd}
                    className={`badge bg-secondary d-inline-flex align-items-center context-menu-badge${flashing === cmd ? ' duplicate-flash' : ''}`}
                    style={{ fontSize: '0.7rem', padding: '0.15rem 0.35rem', fontWeight: 'normal', lineHeight: 1, boxSizing: 'border-box', cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); remove(cmd); }}
                >
                    <span style={{ lineHeight: 1 }}>{cmd}</span>
                    <span style={{ marginLeft: '0.25rem', lineHeight: 1, opacity: 0.7 }}>{'×'}</span>
                </span>
            ))}
            <span
                className={isTyping
                    ? 'badge bg-secondary d-inline-flex align-items-center context-menu-input-wrapper'
                    : 'context-menu-input-wrapper d-inline-flex align-items-center'}
                style={isTyping
                    ? { fontSize: '0.7rem', padding: '0.15rem 0.35rem', fontWeight: 'normal', lineHeight: 1, boxSizing: 'border-box' }
                    : { fontSize: '0.7rem', lineHeight: 1, padding: '0.15rem 0', boxSizing: 'border-box' }}
            >
                <input
                    type="text"
                    id="ui-object-context-menu-input"
                    ref={inputRef}
                    className="border-0"
                    value={inputValue}
                    placeholder={isTyping ? '' : '+'}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={commit}
                    style={isTyping
                        ? { outline: 'none', width: `${len}ch`, maxWidth: `${len}ch`, background: 'transparent', color: 'white', border: 'none', padding: 0, margin: 0, fontSize: 'inherit', fontWeight: 'inherit', lineHeight: 'inherit', boxSizing: 'border-box' }
                        : { outline: 'none', width: '1ch', minWidth: '1ch', background: 'transparent', fontSize: 'inherit', padding: 0, margin: 0, border: 'none', lineHeight: 'inherit' }}
                />
                {isTyping && (
                    <span
                        style={{ cursor: 'pointer', marginLeft: '0.25rem', lineHeight: 1, opacity: 0.7 }}
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setInputValue(''); inputRef.current?.focus(); }}
                    >
                        {'×'}
                    </span>
                )}
            </span>
        </div>
    );
}

export default ObjectContextMenuEditor;
