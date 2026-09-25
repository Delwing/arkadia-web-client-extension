/**
 * A colour that may be left unset: a labelled swatch that is the native colour
 * input itself, drawn empty (dashed, struck through) while there is no colour.
 * Picking one sets it; the small x clears it again.
 */
export function ColorSlot({ label, value, fallback, onChange }: {
    label: string;
    value: string | undefined;
    /** What the picker opens on while the slot is empty. */
    fallback: string;
    onChange: (value: string | undefined) => void;
}) {
    const empty = value === undefined;
    return (
        <span className={`color-slot${empty ? ' is-empty' : ''}`}>
            <span className="color-slot__label">{label}</span>
            <span className="color-slot__swatch">
                <input
                    type="color"
                    value={value ?? fallback}
                    onChange={e => onChange(e.target.value)}
                    title={empty ? `${label}: bez zmiany` : `${label}: ${value}`}
                />
                {!empty && (
                    <button type="button" className="color-slot__clear" title="Bez koloru" onClick={() => onChange(undefined)}>
                        ×
                    </button>
                )}
            </span>
        </span>
    );
}
