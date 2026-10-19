import { X } from 'lucide-react';
import { Button, ColorInput } from '@web-ui/primitives/index.ts';

/**
 * A colour that may be left unset: a labelled swatch that is the native colour
 * input itself, drawn empty (dashed, struck through) while there is no colour.
 * Picking one sets it; the x next to it clears it again. An empty slot keeps
 * the x's place, so picking a colour does not shift the row.
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
            <ColorInput
                value={value ?? fallback}
                onChange={onChange}
                title={empty ? `${label}: bez zmiany` : `${label}: ${value}`}
            />
            {empty ? <span className="color-slot__clear" /> : (
                <Button variant="ghost" size="sm" className="popup-btn--icon color-slot__clear" title="Bez koloru" onClick={() => onChange(undefined)}>
                    <X size={15} strokeWidth={1.75} />
                </Button>
            )}
        </span>
    );
}
