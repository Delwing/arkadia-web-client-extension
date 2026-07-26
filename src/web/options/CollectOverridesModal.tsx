import {useEffect, useState} from 'react';
import {Button, Form, Table} from 'react-bootstrap';
import {type CollectOverride, defaultSettings} from '@modules/core/defaultSettings';

interface CollectOverridesModalProps {
    show: boolean;
    overrides: CollectOverride[];
    onClose: () => void;
    onSave: (overrides: CollectOverride[]) => void;
}

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
        <div
            className="modal show d-block"
            style={{backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1060}}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            {/* Centred + scrollable, matching the alias/trigger edit dialogs: the
                override list grows with every enemy added, and without the height
                cap the dialog outgrows the viewport and takes its footer — Zapisz
                included — off-screen with it. */}
            <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable" style={{zIndex: 1061}}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title">Nadpisania zbierania dla wrogów</h5>
                        <button type="button" className="btn-close" onClick={onClose}/>
                    </div>
                    <div className="modal-body">
                        <p className="text-muted small mb-3">
                            Dodaj nazwy wrogów (np. "troll", "bykocentaur") i wybierz co zbierać z ich ciał.
                        </p>
                        <Table bordered size="sm" hover className="table-modern table-zebra mb-3">
                            <thead>
                            <tr>
                                <th style={{width: '168px'}}>Wróg</th>
                                <th style={{width: '60px'}} className="text-center">MI</th>
                                <th style={{width: '60px'}} className="text-center">SR</th>
                                <th style={{width: '60px'}} className="text-center">ZL</th>
                                <th style={{width: '60px'}} className="text-center">Kamienie</th>
                                <th>Dodatkowe</th>
                                <th style={{width: '60px'}}></th>
                            </tr>
                            </thead>
                            <tbody>
                            {localOverrides.map((override, idx) => (
                                <tr key={idx}>
                                    <td>{override.enemy}</td>
                                    <td className="text-center">
                                        <Form.Check
                                            type="checkbox"
                                            checked={override.collectCopper}
                                            onChange={e => updateOverride(idx, 'collectCopper', e.target.checked)}
                                        />
                                    </td>
                                    <td className="text-center">
                                        <Form.Check
                                            type="checkbox"
                                            checked={override.collectSilver}
                                            onChange={e => updateOverride(idx, 'collectSilver', e.target.checked)}
                                        />
                                    </td>
                                    <td className="text-center">
                                        <Form.Check
                                            type="checkbox"
                                            checked={override.collectGold}
                                            onChange={e => updateOverride(idx, 'collectGold', e.target.checked)}
                                        />
                                    </td>
                                    <td className="text-center">
                                        <Form.Check
                                            type="checkbox"
                                            checked={override.collectGems}
                                            onChange={e => updateOverride(idx, 'collectGems', e.target.checked)}
                                        />
                                    </td>
                                    <td>
                                        <div className="d-flex flex-wrap gap-1 align-items-center">
                                            {override.collectExtra.map(item => (
                                                <span key={item}
                                                      className="badge bg-secondary d-flex align-items-center gap-1">
                                                        {item}
                                                    <button
                                                        type="button"
                                                        className="btn-close btn-close-white"
                                                        style={{fontSize: '0.5rem'}}
                                                        onClick={() => removeExtraItem(idx, item)}
                                                    />
                                                    </span>
                                            ))}
                                            {editingExtraIndex === idx ? (
                                                <div className="d-flex gap-1">
                                                    <input
                                                        type="text"
                                                        className="form-control form-control-sm"
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
                                                        style={{width: '100px'}}
                                                        autoFocus
                                                    />
                                                    <Button size="sm" onClick={() => addExtraItem(idx)}>+</Button>
                                                    <Button size="sm" variant="secondary" onClick={() => {
                                                        setEditingExtraIndex(null);
                                                        setExtraInput('');
                                                    }}>x</Button>
                                                </div>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="outline-secondary"
                                                    onClick={() => {
                                                        setEditingExtraIndex(idx);
                                                        setExtraInput('');
                                                    }}
                                                >
                                                    +
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <Button
                                            size="sm"
                                            variant="danger"
                                            onClick={() => removeOverride(idx)}
                                        >
                                            Usuń
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            <tr>
                                <td colSpan={7}>
                                    <div className="d-flex gap-2">
                                        <input
                                            type="text"
                                            className="form-control form-control-sm"
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
                                            style={{maxWidth: '200px'}}
                                        />
                                        <Button size="sm" onClick={addOverride}>Dodaj</Button>
                                    </div>
                                </td>
                            </tr>
                            </tbody>
                        </Table>
                    </div>
                    <div className="modal-footer justify-content-between">
                        <Button
                            variant="outline-warning"
                            onClick={() => setLocalOverrides(defaultSettings.collectOverrides.map(o => ({
                                ...o,
                                collectExtra: [...o.collectExtra]
                            })))}
                        >
                            Przywróć domyślne
                        </Button>
                        <div className="d-flex gap-2">
                            <Button variant="secondary" onClick={onClose}>Anuluj</Button>
                            <Button variant="primary" onClick={handleSave}>Zapisz</Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
