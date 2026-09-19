import { Button, Input } from "@design";
import { CheckboxField } from "@web/settings/controls.tsx";
import { directionOptions } from "../buttonSettings";
import type { MacroType, ButtonMacroConfig } from "../buttonSettings";
import {
    getMacroStates,
    type PluginButtonMacro,
} from "@modules/core/pluginButtonMacroRegistry";
import MacroSelect from "./MacroSelect";

/** Matches the runtime default for a plugin state with no colour of its own. */
const DEFAULT_STATE_COLOR = "#6EB4DC";

interface MacroConfigEditorProps {
    config: ButtonMacroConfig;
    onChange: (updates: Partial<ButtonMacroConfig>) => void;
    pluginMacros: PluginButtonMacro[];
    /** Button color — used for plugin state color defaults. */
    buttonColor?: string;
    /**
     * Namespaces the ids of a plugin macro's config fields. A compound macro
     * renders one editor per step, so two steps on the same plugin macro would
     * otherwise mint the same id twice and `<label for>` would reach the first
     * step's field from the second step's label.
     */
    idPrefix?: string;
}

export default function MacroConfigEditor({ config, onChange, pluginMacros, buttonColor, idPrefix = '' }: MacroConfigEditorProps) {
    return (
        <>
            {config.macroType === 'command' && (
                <textarea
                    className="settings-textarea"
                    placeholder="Komenda"
                    value={config.command || ''}
                    onChange={e => onChange({ command: e.target.value })}
                    autoCorrect="off"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                />
            )}

            {config.macroType === 'kierunek' && (
                <select
                    className="settings-native-select"
                    value={config.direction || 'n'}
                    onChange={e => onChange({ direction: e.target.value })}
                >
                    {directionOptions.map(d => (
                        <option key={d} value={d}>{d}</option>
                    ))}
                </select>
            )}

            {(config.macroType === 'attackEnemy' || config.macroType === 'blockEnemy') && (
                <select
                    className="settings-native-select"
                    value={config.enemySlot ?? 0}
                    onChange={e => onChange({ enemySlot: parseInt(e.target.value) })}
                >
                    <option value={0}>Slot 1</option>
                    <option value={1}>Slot 2</option>
                    <option value={2}>Slot 3</option>
                </select>
            )}

            {config.macroType === 'compound' && (
                <CompoundStepsEditor
                    steps={config.steps || []}
                    onChange={steps => onChange({ steps })}
                    pluginMacros={pluginMacros}
                    idPrefix={idPrefix}
                />
            )}

            <PluginConfigFields
                macroType={config.macroType}
                pluginConfig={config.pluginConfig}
                onChange={pluginConfig => onChange({ pluginConfig })}
                pluginMacros={pluginMacros}
                idPrefix={idPrefix}
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
    idPrefix: string;
}

function CompoundStepsEditor({ steps, onChange, pluginMacros, idPrefix }: CompoundStepsEditorProps) {
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
        <div className="settings-stack settings-stack--tight">
            <span className="settings-field__label">Kroki</span>
            {steps.map((step, index) => (
                <div key={index} className="settings-step-card">
                    <div className="settings-step-card__header">
                        <span className="settings-step-card__title">Krok {index + 1}</span>
                        <div className="settings-button-row">
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={index === 0}
                                onClick={() => moveStep(index, -1)}
                            >^</Button>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={index === steps.length - 1}
                                onClick={() => moveStep(index, 1)}
                            >v</Button>
                            <Button
                                size="sm"
                                variant="danger-soft"
                                onClick={() => removeStep(index)}
                            >X</Button>
                        </div>
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
                        idPrefix={`${idPrefix}step${index}-`}
                    />
                </div>
            ))}
            <Button
                size="sm"
                variant="outline"
                className="settings-block-button"
                onClick={addStep}
            >+ Dodaj krok</Button>
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
            {pluginMacro.configFields.map(field => {
                const id = `${idPrefix}plugin-config-${field.name}`;
                const value = config[field.name] ?? field.defaultValue ?? '';
                return (
                    <div key={field.name} className="settings-field">
                        {field.type === 'checkbox' ? (
                            <CheckboxField
                                id={id}
                                label={field.label}
                                checked={config[field.name] ?? field.defaultValue ?? false}
                                onChange={checked => onChange({ ...config, [field.name]: checked })}
                            />
                        ) : (
                            <>
                                <label className="settings-field__label" htmlFor={id}>{field.label}</label>
                                {field.type === 'text' && (
                                    <Input
                                        id={id}
                                        type="text"
                                        value={value}
                                        onChange={e => onChange({ ...config, [field.name]: e.target.value })}
                                    />
                                )}
                                {field.type === 'textarea' && (
                                    <textarea
                                        id={id}
                                        className="settings-textarea"
                                        rows={2}
                                        value={value}
                                        onChange={e => onChange({ ...config, [field.name]: e.target.value })}
                                    />
                                )}
                                {field.type === 'number' && (
                                    <Input
                                        id={id}
                                        type="number"
                                        value={config[field.name] ?? field.defaultValue ?? 0}
                                        onChange={e => onChange({ ...config, [field.name]: Number(e.target.value) })}
                                    />
                                )}
                                {field.type === 'select' && field.options && (
                                    <select
                                        id={id}
                                        className="settings-native-select"
                                        value={value}
                                        onChange={e => onChange({ ...config, [field.name]: e.target.value })}
                                    >
                                        {field.options.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                )}
                            </>
                        )}
                    </div>
                );
            })}
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
        <div className="settings-field">
            <span className="settings-field__label">Stany przycisku</span>
            <div className="settings-state-list">
                {states.map(state => (
                    <div key={state.id} className="settings-field">
                        <span className="settings-muted settings-state-list__id">{state.id}</span>
                        <div className="settings-row__controls">
                            <Input
                                type="text"
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
                                className="settings-color"
                                value={stateColors[state.id] || state.color || color || DEFAULT_STATE_COLOR}
                                onChange={e => {
                                    const newStateColors = { ...stateColors };
                                    newStateColors[state.id] = e.target.value;
                                    onChange({ ...config, stateColors: newStateColors });
                                }}
                            />
                            <Button
                                size="sm"
                                variant="outline"
                                title="Przywróć domyślny kolor"
                                onClick={() => {
                                    const newStateColors = { ...stateColors };
                                    delete newStateColors[state.id];
                                    onChange({ ...config, stateColors: newStateColors });
                                }}
                            >
                                {'↺'}
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
