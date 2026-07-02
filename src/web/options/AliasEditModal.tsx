import React, { useState, useEffect } from 'react';
import type { Alias } from './importBlowtorch';
import { collectCharacters } from './exportUtils';

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
        <div
            className="modal show d-block"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1060 }}
            onClick={onClose}
        >
            <div
                className="modal-dialog modal-dialog-centered modal-lg"
                onClick={e => e.stopPropagation()}
            >
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title">
                            {isEdit ? 'Edytuj alias' : 'Dodaj alias'}
                        </h5>
                        <button type="button" className="btn-close" onClick={onClose} />
                    </div>
                    <div className="modal-body">
                        <div className="mb-3">
                            <label className="form-label">Wzorzec (pattern)</label>
                            <div className="input-group">
                                <span className="input-group-text font-monospace" title="Dodawane automatycznie">^</span>
                                <input
                                    type="text"
                                    className="form-control font-monospace"
                                    value={pattern}
                                    onChange={e => setPattern(e.target.value)}
                                    placeholder="np. zab (.+)"
                                    autoCorrect="off"
                                    autoComplete="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                />
                                <span className="input-group-text font-monospace" title="Dodawane automatycznie">$</span>
                            </div>
                            {isDuplicate && (
                                <div className="text-danger small mt-1">Alias o takim wzorcu juz istnieje</div>
                            )}
                        </div>

                        <div className="mb-3">
                            <label className="form-label">Komenda (domyslna)</label>
                            <textarea
                                className="form-control font-monospace"
                                value={command}
                                onChange={e => setCommand(e.target.value)}
                                placeholder="np. zabij $1"
                                rows={2}
                                autoCorrect="off"
                                autoComplete="off"
                                autoCapitalize="off"
                                spellCheck={false}
                            />
                        </div>

                        <div className="mb-3">
                            <label className="form-label">Nadpisania dla postaci</label>
                            {overrides.map((o, idx) => (
                                <div key={o.char} className="d-flex gap-2 align-items-center mb-2">
                                    <span className="text-nowrap small" style={{ minWidth: '8rem' }}>
                                        {o.char}
                                    </span>
                                    <textarea
                                        className="form-control form-control-sm font-monospace"
                                        value={o.cmd}
                                        onChange={e => updateOverrideCmd(idx, e.target.value)}
                                        placeholder="Komenda dla tej postaci"
                                        rows={2}
                                        autoCorrect="off"
                                        autoComplete="off"
                                        autoCapitalize="off"
                                        spellCheck={false}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-outline-danger"
                                        onClick={() => removeOverride(idx)}
                                    >
                                        &times;
                                    </button>
                                </div>
                            ))}
                            {availableChars.length > 0 && (
                                <div className="d-flex gap-2 align-items-center">
                                    <select
                                        className="form-select form-select-sm"
                                        style={{ minWidth: '8rem', maxWidth: '14rem' }}
                                        value={addChar || availableChars[0]}
                                        onChange={e => setAddChar(e.target.value)}
                                    >
                                        {availableChars.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-outline-secondary"
                                        onClick={addOverride}
                                    >
                                        Dodaj
                                    </button>
                                </div>
                            )}
                            {characters.length === 0 && overrides.length === 0 && (
                                <div className="text-muted small">
                                    Brak zapisanych postaci. Nadpisania beda dostepne po zalogowaniu na postac.
                                </div>
                            )}
                        </div>

                        <small className="text-secondary">
                            Pattern jest wyrazeniem regularnym. Znaki <code>^</code> i <code>$</code> sa dodawane automatycznie &mdash; wzorzec musi pasowac do calej komendy.<br />
                            Uzyj <code>$1</code>, <code>$2</code> itd. w komendzie, aby wstawic odpowiednie grupy.<br />
                            Mozesz takze korzystac ze skrotow obiektow (<code>@1</code>, <code>@A</code>, <code>@@</code>), ktore zostana rozwiniete do identyfikatorow obiektow.<br />
                            Uzyj <code>$i</code> w komendzie, aby powtorzyc ja dla zakresu, np. wzorzec <code>kok (.+)</code>, komenda <code>rozerwij $i. kokon</code> &mdash; wpisz <code>kok 1-7</code>.<br />
                            Kazda nowa linia w komendzie dziala jak osobna komenda (jak srednik).
                        </small>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Anuluj
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleSave}
                            disabled={!pattern.trim() || !command.trim() || isDuplicate}
                        >
                            {isEdit ? 'Zapisz' : 'Dodaj'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AliasEditModal;
