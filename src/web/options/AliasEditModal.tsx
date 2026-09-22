import React, { useState, useEffect } from 'react';
import type { CustomSound } from '@modules/core/customSounds';
import { aliasActions, aliasCommandMirror, type UserAlias } from '@client/scripts/userAliases';
import type { UserMacro } from '@client/scripts/userTriggers';
import { collectCharacters } from './exportUtils';
import { Button, Dialog, Field, Input, InputGroup, Select, TextArea } from '@web-ui/primitives/index.ts';
import { MacroEditor, normalizeMacro, type MacroPlaceholder } from './MacroEditor';
import { AutomationMetaFields, automationMetaDraft, automationMetaFromDraft } from './AutomationMetaFields';

export interface AliasEditModalProps {
    show: boolean;
    onClose: () => void;
    onSave: (alias: UserAlias) => void;
    alias?: UserAlias;
    existingPatterns: string[];
    customSounds: CustomSound[];
    onRequestSoundUpload: () => Promise<string | undefined>;
}

const NEW_COMMAND: UserMacro = { type: 'command', command: '' };

/** Number of capture groups in an alias pattern; 0 when it does not compile. */
function groupCount(pattern: string): number {
    try {
        return (new RegExp(`${pattern}|`).exec('')?.length ?? 1) - 1;
    } catch {
        return 0;
    }
}

/** An action that would do nothing: without a line there is no text to fall back on. */
function isEmptyAction(m: UserMacro): boolean {
    switch (m.type) {
        case 'command': return !m.command?.trim();
        case 'notify':
        case 'push':
        case 'speak': return !m.message?.trim();
        case 'functionalBind': return !m.label?.trim() || !m.command?.trim();
        default: return false;
    }
}

const AliasEditModal: React.FC<AliasEditModalProps> = ({
    show,
    onClose,
    onSave,
    alias,
    existingPatterns,
    customSounds,
    onRequestSoundUpload,
}) => {
    const [meta, setMeta] = useState(automationMetaDraft());
    const [pattern, setPattern] = useState('');
    const [macros, setMacros] = useState<UserMacro[]>([NEW_COMMAND]);
    const [overrides, setOverrides] = useState<{ char: string; cmd: string }[]>([]);
    const [addChar, setAddChar] = useState('');

    const characters = collectCharacters();
    const usedChars = new Set(overrides.map(o => o.char));
    const availableChars = characters.filter(c => !usedChars.has(c));

    useEffect(() => {
        setMeta(automationMetaDraft(alias));
        if (alias) {
            setPattern(alias.pattern);
            // The command used to be a textarea where a newline separated
            // commands; the action field is one line, and would drop them.
            const actions = aliasActions(alias).map(m =>
                m.type === 'command' && m.command ? { ...m, command: m.command.replace(/\n+/g, ';') } : m
            );
            setMacros(actions.length ? actions.map(normalizeMacro) : [NEW_COMMAND]);
            setOverrides(
                alias.overrides
                    ? Object.entries(alias.overrides).map(([char, cmd]) => ({ char, cmd }))
                    : []
            );
        } else {
            setPattern('');
            setMacros([NEW_COMMAND]);
            setOverrides([]);
        }
        setAddChar('');
    }, [alias, show]);

    if (!show) return null;

    const isEdit = !!alias;
    const isDuplicate = pattern.trim() !== '' &&
        existingPatterns.some(p => p === pattern.trim() && (!alias || alias.pattern !== p));
    const hasAction = macros.some(m => !isEmptyAction(m));
    const isValid = !!pattern.trim() && hasAction && !isDuplicate;

    const groups = groupCount(pattern.trim());
    const placeholders: MacroPlaceholder[] = Array.from({ length: groups }, (_, i) => ({
        token: `$${i + 1}`,
        label: `Grupa ${i + 1} z wzorca`,
    }));

    const handleSave = () => {
        if (!isValid) return;

        const overridesRecord: Record<string, string> = {};
        for (const o of overrides) {
            const cmd = o.cmd.trim();
            if (cmd) overridesRecord[o.char] = cmd;
        }

        const actions = macros.filter(m => !isEmptyAction(m)).map(normalizeMacro);
        // A single command is stored the way aliases always were, so the most
        // common alias stays readable by everything that predates actions.
        const onlyCommand = actions.length === 1 && actions[0].type === 'command';

        onSave({
            ...automationMetaFromDraft(meta, alias),
            pattern: pattern.trim(),
            command: aliasCommandMirror(actions),
            ...(onlyCommand ? {} : { macros: actions }),
            ...(Object.keys(overridesRecord).length > 0 ? { overrides: overridesRecord } : {}),
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
                    <Button variant="solid" onClick={handleSave} disabled={!isValid}>
                        {isEdit ? 'Zapisz' : 'Dodaj'}
                    </Button>
                </>
            )}
        >
            <div className="popup-stack">
                <AutomationMetaFields value={meta} onChange={setMeta} />

                <Field
                    label="Kiedy wpiszesz"
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

                <div className="trigger-section">
                    <div className="trigger-section__head">
                        <h3 className="trigger-section__title">Co zrobic</h3>
                        {macros.length > 0 && <span className="popup-badge">{macros.length}</span>}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="trigger-section__add"
                            onClick={() => setMacros(prev => [...prev, NEW_COMMAND])}
                        >
                            Dodaj akcję
                        </Button>
                    </div>
                    {macros.length > 0 && (
                        <div className="trigger-actions">
                            {macros.map((m, i) => (
                                <MacroEditor
                                    key={i}
                                    macro={m}
                                    onChange={macro => setMacros(prev => prev.map((p, j) => j === i ? macro : p))}
                                    onRemove={() => setMacros(prev => prev.filter((_, j) => j !== i))}
                                    sounds={customSounds}
                                    onRequestSoundUpload={onRequestSoundUpload}
                                    pluginMacros={[]}
                                    lineless
                                    placeholders={placeholders}
                                    commandPlaceholder="np. zabij $1"
                                />
                            ))}
                        </div>
                    )}
                </div>

                <Field label="Inaczej dla postaci" hint="Zastepuje wszystkie komendy z akcji dla tej postaci.">
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
                    Uzyj <code>$1</code>, <code>$2</code> itd. w komendzie (i w tekstach innych akcji), aby wstawic odpowiednie grupy.<br />
                    Mozesz takze korzystac ze skrotow obiektow (<code>@1</code>, <code>@A</code>, <code>@@</code>), ktore zostana rozwiniete do identyfikatorow obiektow.<br />
                    Uzyj <code>$i</code> w komendzie, aby powtorzyc ja dla zakresu, np. wzorzec <code>kok (.+)</code>, komenda <code>rozerwij $i. kokon</code> &mdash; wpisz <code>kok 1-7</code>.<br />
                    Srednik rozdziela kilka komend w jednym polu. Akcje wykonuja sie po kolei.
                </div>
            </div>
        </Dialog>
    );
};

export default AliasEditModal;
