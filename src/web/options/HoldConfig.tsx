import { Check, Field } from "@web-ui/primitives/index.ts";
import type { MacroType, ButtonMacroConfig } from "../buttonSettings";
import {
    type PluginButtonMacro,
} from "@modules/core/pluginButtonMacroRegistry";
import MacroSelect from "./MacroSelect";
import MacroConfigEditor from "./MacroConfigEditor";

interface HoldConfigProps {
    holdEnabled: boolean;
    hold: ButtonMacroConfig | undefined;
    onToggle: (enabled: boolean) => void;
    onChangeHold: (hold: ButtonMacroConfig) => void;
    pluginMacros: PluginButtonMacro[];
    locked: boolean;
    idSuffix: string;
}

export default function HoldConfig({
    holdEnabled,
    hold,
    onToggle,
    onChangeHold,
    pluginMacros,
    locked,
    idSuffix,
}: HoldConfigProps) {
    const holdCfg: ButtonMacroConfig = hold || { macroType: 'command' };

    function updateHold(updates: Partial<ButtonMacroConfig>) {
        onChangeHold({ ...holdCfg, ...updates });
    }

    const holdFilter = (opt: { value: MacroType }) => opt.value !== 'empty';

    return (
        <div className="macro-hold">
            <Check
                id={`hold-toggle-${idSuffix}`}
                label="Przytrzymanie (hold)"
                checked={holdEnabled}
                onChange={e => onToggle(e.target.checked)}
            />
            {holdEnabled && !locked && (
                <p className="popup-field__warning">
                    Odblokowane przyciski moga kolidowac z przytrzymaniem (przeciaganie po 1s).
                </p>
            )}
            {holdEnabled && (
                <>
                    <Field label="Makro (hold)">
                        <MacroSelect
                            value={holdCfg.macroType || 'command'}
                            onChange={value => {
                                const updates: Partial<ButtonMacroConfig> = { macroType: value };
                                if (value !== 'compound') {
                                    updates.steps = undefined;
                                }
                                updateHold(updates);
                            }}
                            pluginMacros={pluginMacros}
                            filter={holdFilter}
                            showUnavailableWarning
                        />
                    </Field>
                    <MacroConfigEditor
                        config={holdCfg}
                        onChange={updates => updateHold(updates)}
                        pluginMacros={pluginMacros}
                    />
                </>
            )}
        </div>
    );
}
