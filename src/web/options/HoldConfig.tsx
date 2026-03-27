import { Alert, Form } from "react-bootstrap";
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
        <div className="mb-2 pt-2 border-top">
            <Form.Check
                id={`hold-toggle-${idSuffix}`}
                type="checkbox"
                className="mb-2"
                label="Przytrzymanie (hold)"
                checked={holdEnabled}
                onChange={e => onToggle(e.target.checked)}
            />
            {holdEnabled && !locked && (
                <Alert variant="warning" className="py-1 px-2 mb-2 small">
                    Odblokowane przyciski moga kolidowac z przytrzymaniem (przeciaganie po 1s).
                </Alert>
            )}
            {holdEnabled && (
                <>
                    <Form.Group className="mb-2">
                        <Form.Label className="small mb-1">Makro (hold)</Form.Label>
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
                    </Form.Group>
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
