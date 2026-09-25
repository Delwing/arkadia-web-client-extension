import React, { useEffect, useMemo, useState } from 'react';
import { Button, DeleteButton, Dialog, Field, Input, Select, TextArea } from '@web-ui/primitives';
import type { CustomLetterTemplate, LetterTemplateId } from '@client/types/letter.ts';
import {
    createCustomLetterTemplateId,
    customLetterTemplateValue,
    customTemplateLayout,
    layoutToTemplateFields,
    listLetterTemplateChoices,
    loadCustomLetterTemplates,
    onCustomLetterTemplatesChange,
    resolveLetterTemplate,
    saveCustomLetterTemplates,
} from '@modules/core/letterTemplates.ts';
import { renderLetterLayout } from '@shared/letterRenderer.ts';

const SAMPLE_CONTENT = 'Drogi przyjacielu,\n\nto jest przykladowa tresc listu, ktora pokazuje, jak szablon otacza tekst i zawija dluzsze linie. Kazda linia tresci dostaje kolejny poczatek i koniec.\n\n>Twoj druh';

interface LetterTemplatesDialogProps {
    lineWidth: number;
    /** Template to open for editing. */
    initialId?: string;
    onClose: () => void;
    /** Called with a newly added template, so the composer can select it. */
    onAdded?: (value: LetterTemplateId) => void;
}

const LetterTemplatesDialog: React.FC<LetterTemplatesDialogProps> = ({ lineWidth, initialId, onClose, onAdded }) => {
    const [templates, setTemplates] = useState<CustomLetterTemplate[]>(loadCustomLetterTemplates);
    const [selectedId, setSelectedId] = useState<string | null>(() => {
        const list = loadCustomLetterTemplates();
        return list.find(t => t.id === initialId)?.id ?? list[0]?.id ?? null;
    });
    const [baseValue, setBaseValue] = useState<LetterTemplateId>('plain');

    useEffect(() => onCustomLetterTemplatesChange(setTemplates), []);

    const selected = templates.find(t => t.id === selectedId) ?? null;
    const baseChoices = useMemo(() => listLetterTemplateChoices(templates).filter(c => c.value !== 'raw'), [templates]);

    const update = (patch: Partial<CustomLetterTemplate>) => {
        if (!selected) return;
        const next = templates.map(t => (t.id === selected.id ? { ...t, ...patch } : t));
        setTemplates(next);
        saveCustomLetterTemplates(next);
    };

    const add = () => {
        const base = resolveLetterTemplate(baseValue, templates);
        const baseLabel = baseChoices.find(choice => choice.value === baseValue)?.label;
        const template: CustomLetterTemplate = {
            id: createCustomLetterTemplateId(),
            name: baseLabel ? `${baseLabel} (kopia)` : 'Nowy szablon',
            ...layoutToTemplateFields(base?.layout ?? { header: [], footer: [], bodyPrefix: '', bodySuffix: '' }),
        };
        const next = [...templates, template];
        setTemplates(next);
        saveCustomLetterTemplates(next);
        setSelectedId(template.id);
        onAdded?.(customLetterTemplateValue(template.id));
    };

    const remove = () => {
        if (!selected) return;
        const next = templates.filter(t => t.id !== selected.id);
        setTemplates(next);
        saveCustomLetterTemplates(next);
        setSelectedId(next[0]?.id ?? null);
    };

    const preview = useMemo(
        () => (selected ? renderLetterLayout(SAMPLE_CONTENT, customTemplateLayout(selected), lineWidth).lines.join('\n') : ''),
        [selected, lineWidth],
    );

    return (
        <Dialog title="Szablony listow" onClose={onClose} size="xl" className="letter-templates-dialog" footer={
            <Button variant="solid" onClick={onClose}>Zamknij</Button>
        }>
            <div className="letter-templates">
                <div className="letter-templates__sidebar">
                    <div className="letter-templates__list">
                        {templates.length === 0 && (
                            <div className="popup-field__hint">Brak wlasnych szablonow.</div>
                        )}
                        {templates.map(t => (
                            <button
                                key={t.id}
                                type="button"
                                className={`letter-templates__item${t.id === selectedId ? ' is-active' : ''}`}
                                onClick={() => setSelectedId(t.id)}
                            >
                                {t.name || '(bez nazwy)'}
                            </button>
                        ))}
                    </div>
                    <Field label="Nowy na podstawie" htmlFor="letter-template-base">
                        <Select
                            id="letter-template-base"
                            value={baseValue}
                            onChange={(e) => setBaseValue(e.target.value as LetterTemplateId)}
                        >
                            {baseChoices.map(choice => (
                                <option key={choice.value} value={choice.value}>{choice.label}</option>
                            ))}
                        </Select>
                    </Field>
                    <Button size="sm" onClick={add} className="letter-templates__add">Dodaj szablon</Button>
                </div>
                {selected ? (
                    <div className="letter-templates__editor">
                        <div className="letter-templates__fields">
                            <div className="letter-templates__row">
                                <Field label="Nazwa" htmlFor="letter-template-name" className="letter-templates__grow">
                                    <Input
                                        id="letter-template-name"
                                        value={selected.name}
                                        onChange={(e) => update({ name: e.target.value })}
                                    />
                                </Field>
                                <DeleteButton title="Usun szablon" onClick={remove} />
                            </div>
                            <Field
                                label="Naglowek"
                                htmlFor="letter-template-header"
                                hint="{...} - tekst w klamrach powtorzony na szerokosc tresci, np. +--{-}--+ albo +{-=}+"
                            >
                                <TextArea
                                    id="letter-template-header"
                                    mono
                                    rows={5}
                                    wrap="off"
                                    value={selected.header}
                                    onChange={(e) => update({ header: e.target.value })}
                                />
                            </Field>
                            <div className="popup-field__hint">
                                Poczatek i koniec linii tresci moga miec kilka linii - kolejne linie tresci uzywaja ich po kolei, w kolko.
                            </div>
                            <div className="letter-templates__row">
                                <Field label="Poczatek linii tresci" htmlFor="letter-template-prefix" className="letter-templates__grow">
                                    <TextArea
                                        id="letter-template-prefix"
                                        mono
                                        rows={2}
                                        wrap="off"
                                        value={selected.bodyPrefix}
                                        onChange={(e) => update({ bodyPrefix: e.target.value })}
                                    />
                                </Field>
                                <Field label="Koniec linii tresci" htmlFor="letter-template-suffix" className="letter-templates__grow">
                                    <TextArea
                                        id="letter-template-suffix"
                                        mono
                                        rows={2}
                                        wrap="off"
                                        value={selected.bodySuffix}
                                        onChange={(e) => update({ bodySuffix: e.target.value })}
                                    />
                                </Field>
                            </div>
                            <Field label="Stopka" htmlFor="letter-template-footer">
                                <TextArea
                                    id="letter-template-footer"
                                    mono
                                    rows={5}
                                    wrap="off"
                                    value={selected.footer}
                                    onChange={(e) => update({ footer: e.target.value })}
                                />
                            </Field>
                        </div>
                        <div className="letter-templates__preview">
                            <div className="popup-field__label">Podglad (szerokosc {lineWidth})</div>
                            <pre className="letter-composer-preview-text letter-templates__preview-text">{preview}</pre>
                        </div>
                    </div>
                ) : (
                    <div className="letter-templates__empty popup-field__hint">
                        Wybierz szablon bazowy i kliknij "Dodaj szablon", aby stworzyc wlasny.
                    </div>
                )}
            </div>
        </Dialog>
    );
};

export default LetterTemplatesDialog;
