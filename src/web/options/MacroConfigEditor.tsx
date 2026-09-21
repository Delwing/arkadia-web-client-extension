import { Button, Check, DeleteButton, Field, Input, Select, TextArea } from "@web-ui/primitives/index.ts";
import { directionOptions } from "../buttonSettings";
import type { MacroType, ButtonMacroConfig } from "../buttonSettings";
import {
    getMacroStates,
    type PluginButtonMacro,
} from "@modules/core/pluginButtonMacroRegistry";
import MacroSelect from "./MacroSelect";

interface MacroConfigEditorProps {
    config: ButtonMacroConfig;
    onChange: (updates: Partial<ButtonMacroConfig>) => void;
    pluginMacros: PluginButtonMacro[];
    /** Button color — used for plugin state color defaults. */
    buttonColor?: string;
}

export default function MacroConfigEditor({ config, onChange, pluginMacros, buttonColor }: MacroConfigEditorProps) {
    return (
        <>
            {config.macroType === 'command' && (
                <TextArea
                    mono
                    rows={2}
                    placeholder="Komenda"
                    value={config.command || ''}
                    onChange={e => onChange({ command: e.target.value })}
                />
            )}

            {config.macroType === 'kierunek' && (
                <Select
                    className="settings-narrow"
                    value={config.direction || 'n'}
                    onChange={e => onChange({ direction: e.target.value })}
                >
                    {directionOptions.map(d => (
                        <option key={d} value={d}>{d}</option>
                    ))}
                </Select>
            )}

            {(config.macroType === 'attackEnemy' || config.macroType === 'blockEnemy') && (
                <Select
                    className="settings-narrow"
                    value={config.enemySlot ?? 0}
                    onChange={e => onChange({ enemySlot: parseInt(e.target.value) })}
                >
                    <option value={0}>Slot 1</option>
                    <option value={1}>Slot 2</option>
                    <option value={2}>Slot 3</option>
                </Select>
            )}

            {config.macroType === 'compound' && (
                <CompoundStepsEditor
                    steps={config.steps || []}
                    onChange={steps => onChange({ steps })}
                    pluginMacros={pluginMacros}
                />
            )}

            <PluginConfigFields
                macroType={config.macroType}
                pluginConfig={config.pluginConfig}
                onChange={pluginConfig => onChange({ pluginConfig })}
                pluginMacros={pluginMacros}
            />

            <PluginStateConfig
                macroType={config.macroType}
                pluginConfig={config.pluginConfig}
                onChange={pluginConfig => onChange({ pluginConfig })}
                color={buttonColor}
            />
        </>
    );
}

// --- Compound Steps Editor (internal) ---

interface CompoundStepsEditorProps {
    steps: ButtonMacroConfig[];
    onChange: (steps: ButtonMacroConfig[]) => void;
    pluginMacros: PluginButtonMacro[];
}

function CompoundStepsEditor({ steps, onChange, pluginMacros }: CompoundStepsEditorProps) {
    function updateStep(index: number, updates: Partial<ButtonMacroConfig>) {
        const newSteps = [...steps];
        newSteps[index] = { ...newSteps[index], ...updates };
        onChange(newSteps);
    }

    function moveStep(index: number, direction: -1 | 1) {
        const newSteps = [...steps];
        const target = index + direction;
        [newSteps[index], newSteps[target]] = [newSteps[target], newSteps[index]];
        onChange(newSteps);
    }

    function removeStep(index: number) {
        onChange(steps.filter((_, i) => i !== index));
    }

    function addStep() {
        onChange([...steps, { macroType: 'command' as MacroType, command: '' }]);
    }

    const stepFilter = (opt: { value: MacroType }) => opt.value !== 'empty' && opt.value !== 'compound';

    return (
        <div className="popup-field macro-steps">
            <span className="popup-field__label">Kroki</span>
            {steps.map((step, index) => (
                <div key={index} className="macro-step">
                    <div className="macro-step__header">
                        <span className="macro-step__title">Krok {index + 1}</span>
                        <Button size="sm" variant="ghost" title="W górę" disabled={index === 0} onClick={() => moveStep(index, -1)}>^</Button>
                        <Button size="sm" variant="ghost" title="W dół" disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)}>v</Button>
                        <DeleteButton title="Usuń krok" onClick={() => removeStep(index)} />
                    </div>
                    <MacroSelect
                        value={step.macroType}
                        onChange={value => updateStep(index, { macroType: value })}
                        pluginMacros={pluginMacros}
                        filter={stepFilter}
                    />
                    <MacroConfigEditor
                        config={step}
                        onChange={updates => updateStep(index, updates)}
                        pluginMacros={pluginMacros}
                        buttonColor={undefined}
                    />
                </div>
            ))}
            <Button size="sm" className="ui-settings-self-start" onClick={addStep}>+ Dodaj krok</Button>
        </div>
    );
}

// --- Plugin Config Fields (internal) ---

interface PluginConfigFieldsProps {
    macroType: string;
    pluginConfig: Record<string, any> | undefined;
    onChange: (pluginConfig: Record<string, any>) => void;
    pluginMacros: PluginButtonMacro[];
    idPrefix?: string;
}

function PluginConfigFields({ macroType, pluginConfig, onChange, pluginMacros, idPrefix = '' }: PluginConfigFieldsProps) {
    if (!macroType.startsWith('plugin:')) return null;
    const pluginMacro = pluginMacros.find(pm => pm.id === macroType);
    if (!pluginMacro?.configFields?.length) return null;

    const config = pluginConfig || {};

    return (
        <>
            {pluginMacro.configFields.map(field => (
                <Field key={field.name} label={field.type === 'checkbox' ? undefined : field.label}>
                    {field.type === 'text' && (
                        <Input
                            value={config[field.name] ?? field.defaultValue ?? ''}
                            onChange={e => onChange({ ...config, [field.name]: e.target.value })}
                        />
                    )}
                    {field.type === 'textarea' && (
                        <TextArea
                            rows={2}
                            value={config[field.name] ?? field.defaultValue ?? ''}
                            onChange={e => onChange({ ...config, [field.name]: e.target.value })}
                        />
                    )}
                    {field.type === 'number' && (
                        <Input
                            type="number"
                            className="settings-num"
                            value={config[field.name] ?? field.defaultValue ?? 0}
                            onChange={e => onChange({ ...config, [field.name]: Number(e.target.value) })}
                        />
                    )}
                    {field.type === 'select' && field.options && (
                        <Select
                            value={config[field.name] ?? field.defaultValue ?? ''}
                            onChange={e => onChange({ ...config, [field.name]: e.target.value })}
                        >
                            {field.options.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </Select>
                    )}
                    {field.type === 'checkbox' && (
                        <Check
                            id={`${idPrefix}plugin-config-${field.name}`}
                            label={field.label}
                            checked={config[field.name] ?? field.defaultValue ?? false}
                            onChange={e => onChange({ ...config, [field.name]: e.target.checked })}
                        />
                    )}
                </Field>
            ))}
        </>
    );
}

// --- Plugin State Config (internal) ---

interface PluginStateConfigProps {
    macroType: string;
    pluginConfig: Record<string, any> | undefined;
    onChange: (pluginConfig: Record<string, any>) => void;
    color: string | undefined;
}

function PluginStateConfig({ macroType, pluginConfig, onChange, color }: PluginStateConfigProps) {
    if (!macroType.startsWith('plugin:')) return null;
    const states = getMacroStates(macroType);
    if (!states?.length) return null;

    const config = pluginConfig || {};
    const stateLabels = (config.stateLabels || {}) as Record<string, string>;
    const stateColors = (config.stateColors || {}) as Record<string, string>;

    return (
        <Field label="Stany przycisku">
            <div className="settings-rows">
                {states.map(state => (
                    <div key={state.id} className="settings-row">
                        <span className="popup-field__label">{state.id}</span>
                        <div className="popup-inline">
                            <Input
                                placeholder={state.label}
                                value={stateLabels[state.id] ?? ''}
                                onChange={e => {
                                    const newStateLabels = { ...stateLabels };
                                    if (e.target.value) {
                                        newStateLabels[state.id] = e.target.value;
                                    } else {
                                        delete newStateLabels[state.id];
                                    }
                                    onChange({ ...config, stateLabels: newStateLabels });
                                }}
                            />
                            <input
                                type="color"
                                className="popup-color"
                                value={stateColors[state.id] || state.color || color || '#6EB4DC'}
                                onChange={e => {
                                    const newStateColors = { ...stateColors };
                                    newStateColors[state.id] = e.target.value;
                                    onChange({ ...config, stateColors: newStateColors });
                                }}
                            />
                            <Button
                                size="sm"
                                variant="ghost"
                                title="Przywróć domyślny kolor"
                                onClick={() => {
                                    const newStateColors = { ...stateColors };
                                    delete newStateColors[state.id];
                                    onChange({ ...config, stateColors: newStateColors });
                                }}
                            >
                                ↺
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </Field>
    );
}
