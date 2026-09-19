import { Callout } from "@design";
import { CheckboxField } from "@web/settings/controls.tsx";
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
        <div className="settings-subsection">
            <CheckboxField
                id={`hold-toggle-${idSuffix}`}
                label="Przytrzymanie (hold)"
                checked={holdEnabled}
                onChange={onToggle}
            />
            {holdEnabled && !locked && (
                <Callout tone="warning">
                    Odblokowane przyciski moga kolidowac z przytrzymaniem (przeciaganie po 1s).
                </Callout>
            )}
            {holdEnabled && (
                <>
                    <div className="settings-field">
                        <span className="settings-field__label">Makro (hold)</span>
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
                    </div>
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
