/** The phone's own one-tap commands, editable in place. */

import { useState } from "react";

export function QuickCommands({ commands, draft, onSend, onChange }: {
    commands: string[];
    /** What is in the command line now; "+" saves it as a button. */
    draft: string;
    onSend: (command: string) => void;
    onChange: (commands: string[]) => void;
}) {
    const [editing, setEditing] = useState(false);
    const canAdd = draft.trim() !== '' && !commands.includes(draft.trim());

    return (
        <div className="rc-quick">
            {commands.map(command => (
                <button
                    key={command}
                    type="button"
                    className={editing ? 'rc-chip-btn editing' : 'rc-chip-btn'}
                    onClick={() => editing ? onChange(commands.filter(c => c !== command)) : onSend(command)}
                >
                    {editing && <span className="rc-remove">✕ </span>}{command}
                </button>
            ))}
            {editing && (
                <button
                    type="button"
                    className="rc-chip-btn rc-add"
                    disabled={!canAdd}
                    onClick={() => onChange([...commands, draft.trim()])}
                >
                    + {canAdd ? draft.trim() : 'wpisz komendę w pole'}
                </button>
            )}
            <button type="button" className="rc-chip-btn rc-edit" onClick={() => setEditing(!editing)}>
                {editing ? 'Gotowe' : 'Edytuj'}
            </button>
        </div>
    );
}
