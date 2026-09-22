import {useEffect, useState} from 'react';
import {Button, DeleteButton, Dialog, Input} from '@web-ui/primitives/index.ts';
import {type CollectOverride, defaultSettings} from '@modules/core/defaultSettings';

interface CollectOverridesModalProps {
    show: boolean;
    overrides: CollectOverride[];
    onClose: () => void;
    onSave: (overrides: CollectOverride[]) => void;
}

/** The four yes/no loot columns, in table order. */
const FLAG_COLUMNS = ['collectCopper', 'collectSilver', 'collectGold', 'collectGems'] as const;

const emptyOverride: CollectOverride = {
    enemy: '',
    collectCopper: false,
    collectSilver: false,
    collectGold: false,
    collectGems: true,
    collectExtra: [],
};

export function CollectOverridesModal({ show, overrides, onClose, onSave }: CollectOverridesModalProps) {
    const [localOverrides, setLocalOverrides] = useState<CollectOverride[]>(overrides);
    const [newEnemy, setNewEnemy] = useState('');
    const [editingExtraIndex, setEditingExtraIndex] = useState<number | null>(null);
    const [extraInput, setExtraInput] = useState('');

    useEffect(() => {
        if (show) {
            setLocalOverrides(overrides);
            setNewEnemy('');
            setEditingExtraIndex(null);
            setExtraInput('');
        }
    }, [show, overrides]);

    function addOverride() {
        if (!newEnemy.trim()) return;
        const exists = localOverrides.some(o => o.enemy.toLowerCase() === newEnemy.trim().toLowerCase());
        if (exists) return;
        setLocalOverrides([...localOverrides, { ...emptyOverride, enemy: newEnemy.trim() }]);
        setNewEnemy('');
    }

    function removeOverride(index: number) {
        setLocalOverrides(localOverrides.filter((_, i) => i !== index));
        if (editingExtraIndex === index) {
            setEditingExtraIndex(null);
            setExtraInput('');
        }
    }

    function updateOverride(index: number, field: keyof CollectOverride, value: boolean) {
        setLocalOverrides(localOverrides.map((o, i) => i === index ? { ...o, [field]: value } : o));
    }

    function addExtraItem(index: number) {
        if (!extraInput.trim()) return;
        setLocalOverrides(localOverrides.map((o, i) => {
            if (i !== index) return o;
            if (o.collectExtra.includes(extraInput.trim())) return o;
            return { ...o, collectExtra: [...o.collectExtra, extraInput.trim()] };
        }));
        setExtraInput('');
    }

    function removeExtraItem(overrideIndex: number, item: string) {
        setLocalOverrides(localOverrides.map((o, i) => {
            if (i !== overrideIndex) return o;
            return { ...o, collectExtra: o.collectExtra.filter(e => e !== item) };
        }));
    }

    function handleSave() {
        onSave(localOverrides);
        onClose();
    }

    if (!show) return null;

    return (
        <Dialog
            title="Nadpisania zbierania dla wrogów"
            onClose={onClose}
            size="lg"
            footer={(
                <>
                    <Button
                        variant="ghost"
                        className="collect-overrides__reset"
                        onClick={() => setLocalOverrides(defaultSettings.collectOverrides.map(o => ({
                            ...o,
                            collectExtra: [...o.collectExtra]
                        })))}
                    >
                        Przywróć domyślne
                    </Button>
                    <Button onClick={onClose}>Anuluj</Button>
                    <Button variant="solid" onClick={handleSave}>Zapisz</Button>
                </>
            )}
        >
            <div className="popup-stack">
                <div className="popup-field__hint">
                    Dodaj nazwy wrogów (np. "troll", "bykocentaur") i wybierz co zbierać z ich ciał.
                </div>
                <table className="popup-table collect-overrides">
                    <thead>
                    <tr>
                        <th className="collect-overrides__enemy">Wróg</th>
                        <th className="collect-overrides__flag">MI</th>
                        <th className="collect-overrides__flag">SR</th>
                        <th className="collect-overrides__flag">ZL</th>
                        <th className="collect-overrides__flag">Kamienie</th>
                        <th>Dodatkowe</th>
                        <th className="collect-overrides__remove"></th>
                    </tr>
                    </thead>
                    <tbody>
                    {localOverrides.map((override, idx) => (
                        <tr key={idx}>
                            <td>{override.enemy}</td>
                            {FLAG_COLUMNS.map(field => (
                                <td key={field} className="collect-overrides__flag">
                                    <input
                                        type="checkbox"
                                        className="collect-overrides__check"
                                        checked={override[field]}
                                        onChange={e => updateOverride(idx, field, e.target.checked)}
                                    />
                                </td>
                            ))}
                            <td>
                                <div className="collect-overrides__extras">
                                    {override.collectExtra.map(item => (
                                        <span key={item} className="popup-badge">
                                            {item}
                                            <button
                                                type="button"
                                                className="collect-overrides__extra-remove"
                                                onClick={() => removeExtraItem(idx, item)}
                                                title="Usuń"
                                            >
                                                &times;
                                            </button>
                                        </span>
                                    ))}
                                    {editingExtraIndex === idx ? (
                                        <div className="popup-inline">
                                            <Input
                                                className="collect-overrides__extra-input"
                                                data-dialog-escape="local"
                                                value={extraInput}
                                                onChange={e => setExtraInput(e.target.value)}
                                                onKeyDown={e => {
                                                    e.stopPropagation();
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        addExtraItem(idx);
                                                    } else if (e.key === 'Escape') {
                                                        setEditingExtraIndex(null);
                                                        setExtraInput('');
                                                    }
                                                }}
                                                autoFocus
                                            />
                                            <Button size="sm" onClick={() => addExtraItem(idx)} title="Dodaj">+</Button>
                                            <Button size="sm" variant="ghost" onClick={() => {
                                                setEditingExtraIndex(null);
                                                setExtraInput('');
                                            }} title="Anuluj">&times;</Button>
                                        </div>
                                    ) : (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => {
                                                setEditingExtraIndex(idx);
                                                setExtraInput('');
                                            }}
                                            title="Dodaj przedmiot"
                                        >
                                            +
                                        </Button>
                                    )}
                                </div>
                            </td>
                            <td>
                                <DeleteButton onClick={() => removeOverride(idx)}/>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                <div className="popup-inline">
                    <Input
                        className="collect-overrides__new-enemy"
                        placeholder="Nazwa wroga (np. troll)"
                        value={newEnemy}
                        onChange={e => setNewEnemy(e.target.value)}
                        onKeyDown={e => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                addOverride();
                            }
                        }}
                    />
                    <Button onClick={addOverride}>Dodaj</Button>
                </div>
            </div>
        </Dialog>
    );
}
