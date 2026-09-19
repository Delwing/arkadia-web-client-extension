import {useEffect, useState} from 'react';
import {Badge, Button, IconButton, Input, Table, TableCell, TableHeadCell, TableRow} from '@design';
import {Checkbox} from '@design';
import SubDialog from '../SubDialog';
import {SettingsHint} from '@web/settings/controls.tsx';
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

    const footer = (
        <div className="settings-overrides__footer">
            <Button
                variant="outline"
                onClick={() => setLocalOverrides(defaultSettings.collectOverrides.map(o => ({
                    ...o,
                    collectExtra: [...o.collectExtra]
                })))}
            >
                Przywróć domyślne
            </Button>
            <div className="settings-button-row">
                <Button onClick={onClose}>Anuluj</Button>
                <Button variant="solid" onClick={handleSave}>Zapisz</Button>
            </div>
        </div>
    );

    /* Centred + scrollable, matching the alias/trigger edit dialogs: the
       override list grows with every enemy added, and without the height cap
       the dialog outgrows the viewport and takes its footer -- Zapisz included
       -- off-screen with it. SubDialog does both; it also replaces the modal
       chrome this component used to hand-roll, which was a copy of it. */
    return (
        <SubDialog title="Nadpisania zbierania dla wrogów" onClose={onClose} size="lg" footer={footer}>
            <SettingsHint>
                Dodaj nazwy wrogów (np. "troll", "bykocentaur") i wybierz co zbierać z ich ciał.
            </SettingsHint>
            <Table compact zebra hoverable className="settings-overrides">
                <thead>
                <TableRow>
                    <TableHeadCell>Wróg</TableHeadCell>
                    <TableHeadCell align="center">MI</TableHeadCell>
                    <TableHeadCell align="center">SR</TableHeadCell>
                    <TableHeadCell align="center">ZL</TableHeadCell>
                    <TableHeadCell align="center">Kamienie</TableHeadCell>
                    <TableHeadCell align="grow">Dodatkowe</TableHeadCell>
                    <TableHeadCell/>
                </TableRow>
                </thead>
                <tbody>
                {localOverrides.map((override, idx) => (
                    <TableRow key={idx}>
                        <TableCell>{override.enemy}</TableCell>
                        {(['collectCopper', 'collectSilver', 'collectGold', 'collectGems'] as const).map(coin => (
                            <TableCell key={coin} align="center">
                                <Checkbox
                                    checked={override[coin]}
                                    onCheckedChange={checked => updateOverride(idx, coin, checked)}
                                />
                            </TableCell>
                        ))}
                        <TableCell align="grow">
                            <div className="settings-overrides__extras">
                                {override.collectExtra.map(item => (
                                    <Badge key={item}>
                                        {item}
                                        <IconButton
                                            plain
                                            size="sm"
                                            title={`Usuń ${item}`}
                                            onClick={() => removeExtraItem(idx, item)}
                                        >
                                            {'\u00d7'}
                                        </IconButton>
                                    </Badge>
                                ))}
                                {editingExtraIndex === idx ? (
                                    <div className="settings-overrides__add">
                                        <Input
                                            type="text"
                                            value={extraInput}
                                            autoFocus
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
                                        />
                                        <Button size="sm" onClick={() => addExtraItem(idx)}>+</Button>
                                        <Button size="sm" variant="ghost" onClick={() => {
                                            setEditingExtraIndex(null);
                                            setExtraInput('');
                                        }}>x</Button>
                                    </div>
                                ) : (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        title="Dodaj przedmiot"
                                        onClick={() => {
                                            setEditingExtraIndex(idx);
                                            setExtraInput('');
                                        }}
                                    >
                                        +
                                    </Button>
                                )}
                            </div>
                        </TableCell>
                        <TableCell>
                            <Button size="sm" variant="danger-soft" onClick={() => removeOverride(idx)}>
                                Usuń
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
                <TableRow>
                    <TableCell colSpan={7}>
                        <div className="settings-overrides__add">
                            <Input
                                type="text"
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
                            <Button size="sm" onClick={addOverride}>Dodaj</Button>
                        </div>
                    </TableCell>
                </TableRow>
                </tbody>
            </Table>
        </SubDialog>
    );
}
