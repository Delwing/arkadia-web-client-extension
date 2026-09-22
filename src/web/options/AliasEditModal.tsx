import React, { useState, useEffect } from 'react';
import type { Alias } from './importBlowtorch';
import { collectCharacters } from './exportUtils';
import { Button, Dialog, Field, Input, InputGroup, Select, TextArea } from '@web-ui/primitives/index.ts';

export interface AliasEditModalProps {
    show: boolean;
    onClose: () => void;
    onSave: (alias: Alias) => void;
    alias?: Alias;
    existingPatterns: string[];
}

const AliasEditModal: React.FC<AliasEditModalProps> = ({
    show,
    onClose,
    onSave,
    alias,
    existingPatterns,
}) => {
    const [pattern, setPattern] = useState('');
    const [command, setCommand] = useState('');
    const [overrides, setOverrides] = useState<{ char: string; cmd: string }[]>([]);
    const [addChar, setAddChar] = useState('');

    const characters = collectCharacters();
    const usedChars = new Set(overrides.map(o => o.char));
    const availableChars = characters.filter(c => !usedChars.has(c));

    useEffect(() => {
        if (alias) {
            setPattern(alias.pattern);
            setCommand(alias.command);
            setOverrides(
                alias.overrides
                    ? Object.entries(alias.overrides).map(([char, cmd]) => ({ char, cmd }))
                    : []
            );
        } else {
            setPattern('');
            setCommand('');
            setOverrides([]);
        }
        setAddChar('');
    }, [alias, show]);

    if (!show) return null;

    const isEdit = !!alias;
    const isDuplicate = pattern.trim() !== '' &&
        existingPatterns.some(p => p === pattern.trim() && (!alias || alias.pattern !== p));

    const handleSave = () => {
        const p = pattern.trim();
        const c = command.trim();
        if (!p || !c) return;
        if (isDuplicate) return;

        const overridesRecord: Record<string, string> = {};
        for (const o of overrides) {
            const cmd = o.cmd.trim();
            if (cmd) overridesRecord[o.char] = cmd;
        }

        onSave({
            pattern: p,
            command: c,
            overrides: Object.keys(overridesRecord).length > 0 ? overridesRecord : undefined,
        });
    };

    const addOverride = () => {
        const char = addChar || availableChars[0];
        if (!char) return;
        setOverrides([...overrides, { char, cmd: '' }]);
        setAddChar('');
    };

    const removeOverride = (idx: number) => {
        setOverrides(overrides.filter((_, i) => i !== idx));
    };

    const updateOverrideCmd = (idx: number, cmd: string) => {
        setOverrides(overrides.map((o, i) => i === idx ? { ...o, cmd } : o));
    };

    return (
        <Dialog
            title={isEdit ? 'Edytuj alias' : 'Dodaj alias'}
            onClose={onClose}
            size="lg"
            footer={(
                <>
                    <Button onClick={onClose}>Anuluj</Button>
                    <Button
                        variant="solid"
                        onClick={handleSave}
                        disabled={!pattern.trim() || !command.trim() || isDuplicate}
                    >
                        {isEdit ? 'Zapisz' : 'Dodaj'}
                    </Button>
                </>
            )}
        >
            <div className="popup-stack">
                <Field
                    label="Wzorzec (pattern)"
                    htmlFor="alias-edit-pattern"
                    error={isDuplicate ? 'Alias o takim wzorcu juz istnieje' : undefined}
                >
                    <InputGroup before="^" after="$">
                        <Input
                            id="alias-edit-pattern"
                            mono
                            value={pattern}
                            onChange={e => setPattern(e.target.value)}
                            placeholder="np. zab (.+)"
                        />
                    </InputGroup>
                </Field>

                <Field label="Komenda (domyslna)" htmlFor="alias-edit-command">
                    <TextArea
                        id="alias-edit-command"
                        mono
                        value={command}
                        onChange={e => setCommand(e.target.value)}
                        placeholder="np. zabij $1"
                        rows={2}
                    />
                </Field>

                <Field label="Nadpisania dla postaci">
                    {overrides.map((o, idx) => (
                        <div key={o.char} className="popup-inline">
                            <span className="alias-edit__char">{o.char}</span>
                            <TextArea
                                mono
                                value={o.cmd}
                                onChange={e => updateOverrideCmd(idx, e.target.value)}
                                placeholder="Komenda dla tej postaci"
                                rows={2}
                            />
                            <Button variant="danger" size="sm" onClick={() => removeOverride(idx)} title="Usun nadpisanie">
                                &times;
                            </Button>
                        </div>
                    ))}
                    {availableChars.length > 0 && (
                        <div className="popup-inline">
                            <Select
                                className="alias-edit__char-select"
                                value={addChar || availableChars[0]}
                                onChange={e => setAddChar(e.target.value)}
                            >
                                {availableChars.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </Select>
                            <Button onClick={addOverride}>Dodaj</Button>
                        </div>
                    )}
                    {characters.length === 0 && overrides.length === 0 && (
                        <div className="popup-field__hint">
                            Brak zapisanych postaci. Nadpisania beda dostepne po zalogowaniu na postac.
                        </div>
                    )}
                </Field>

                <div className="popup-field__hint alias-edit__help">
                    Pattern jest wyrazeniem regularnym. Znaki <code>^</code> i <code>$</code> sa dodawane automatycznie &mdash; wzorzec musi pasowac do calej komendy.<br />
                    Uzyj <code>$1</code>, <code>$2</code> itd. w komendzie, aby wstawic odpowiednie grupy.<br />
                    Mozesz takze korzystac ze skrotow obiektow (<code>@1</code>, <code>@A</code>, <code>@@</code>), ktore zostana rozwiniete do identyfikatorow obiektow.<br />
                    Uzyj <code>$i</code> w komendzie, aby powtorzyc ja dla zakresu, np. wzorzec <code>kok (.+)</code>, komenda <code>rozerwij $i. kokon</code> &mdash; wpisz <code>kok 1-7</code>.<br />
                    Kazda nowa linia w komendzie dziala jak osobna komenda (jak srednik).
                </div>
            </div>
        </Dialog>
    );
};

export default AliasEditModal;
