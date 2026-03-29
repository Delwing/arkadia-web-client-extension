import { Button, Form } from "react-bootstrap";
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
                <Form.Control
                    as="textarea"
                    size="sm"
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
                <Form.Select
                    size="sm"
                    value={config.direction || 'n'}
                    onChange={e => onChange({ direction: e.target.value })}
                >
                    {directionOptions.map(d => (
                        <option key={d} value={d}>{d}</option>
                    ))}
                </Form.Select>
            )}

            {(config.macroType === 'attackEnemy' || config.macroType === 'blockEnemy') && (
                <Form.Select
                    size="sm"
                    value={config.enemySlot ?? 0}
                    onChange={e => onChange({ enemySlot: parseInt(e.target.value) })}
                >
                    <option value={0}>Slot 1</option>
                    <option value={1}>Slot 2</option>
                    <option value={2}>Slot 3</option>
                </Form.Select>
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
        <div>
            <Form.Label className="small fw-bold">Kroki</Form.Label>
            {steps.map((step, index) => (
                <div key={index} className="mb-2 p-2 border rounded">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className="small fw-bold">Krok {index + 1}</span>
                        <div className="d-flex gap-1">
                            <Button
                                size="sm"
                                variant="outline-secondary"
                                disabled={index === 0}
                                onClick={() => moveStep(index, -1)}
                            >^</Button>
                            <Button
                                size="sm"
                                variant="outline-secondary"
                                disabled={index === steps.length - 1}
                                onClick={() => moveStep(index, 1)}
                            >v</Button>
                            <Button
                                size="sm"
                                variant="outline-danger"
                                onClick={() => removeStep(index)}
                            >X</Button>
                        </div>
                    </div>
                    <MacroSelect
                        value={step.macroType}
                        onChange={value => updateStep(index, { macroType: value })}
                        pluginMacros={pluginMacros}
                        filter={stepFilter}
                        className="mb-1"
                    />
                    <MacroConfigEditor
                        config={step}
                        onChange={updates => updateStep(index, updates)}
                        pluginMacros={pluginMacros}
                        buttonColor={undefined}
                    />
                </div>
            ))}
            <Button
                size="sm"
                variant="outline-primary"
                className="w-100"
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
            {pluginMacro.configFields.map(field => (
                <Form.Group key={field.name} className="mb-2">
                    <Form.Label>{field.label}</Form.Label>
                    {field.type === 'text' && (
                        <Form.Control
                            size="sm"
                            type="text"
                            value={config[field.name] ?? field.defaultValue ?? ''}
                            onChange={e => onChange({ ...config, [field.name]: e.target.value })}
                        />
                    )}
                    {field.type === 'textarea' && (
                        <Form.Control
                            as="textarea"
                            size="sm"
                            rows={2}
                            value={config[field.name] ?? field.defaultValue ?? ''}
                            onChange={e => onChange({ ...config, [field.name]: e.target.value })}
                        />
                    )}
                    {field.type === 'number' && (
                        <Form.Control
                            size="sm"
                            type="number"
                            value={config[field.name] ?? field.defaultValue ?? 0}
                            onChange={e => onChange({ ...config, [field.name]: Number(e.target.value) })}
                        />
                    )}
                    {field.type === 'select' && field.options && (
                        <Form.Select
                            size="sm"
                            value={config[field.name] ?? field.defaultValue ?? ''}
                            onChange={e => onChange({ ...config, [field.name]: e.target.value })}
                        >
                            {field.options.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </Form.Select>
                    )}
                    {field.type === 'checkbox' && (
                        <Form.Check
                            id={`${idPrefix}plugin-config-${field.name}`}
                            type="checkbox"
                            checked={config[field.name] ?? field.defaultValue ?? false}
                            onChange={e => onChange({ ...config, [field.name]: e.target.checked })}
                        />
                    )}
                </Form.Group>
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
        <div className="mb-2">
            <Form.Label>Stany przycisku</Form.Label>
            <div className="ps-2 border-start">
                {states.map(state => (
                    <div key={state.id} className="mb-2">
                        <div className="small text-muted mb-1">{state.id}</div>
                        <div className="d-flex gap-1 align-items-center">
                            <Form.Control
                                size="sm"
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
                            <Form.Control
                                size="sm"
                                type="color"
                                style={{ width: '40px', flexShrink: 0 }}
                                value={stateColors[state.id] || state.color || color || '#6EB4DC'}
                                onChange={e => {
                                    const newStateColors = { ...stateColors };
                                    newStateColors[state.id] = e.target.value;
                                    onChange({ ...config, stateColors: newStateColors });
                                }}
                            />
                            <Button
                                size="sm"
                                variant="outline-secondary"
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
        </div>
    );
}
