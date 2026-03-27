import { Form } from "react-bootstrap";
import { macroOptions } from "../buttonSettings";
import type { MacroType } from "../buttonSettings";
import {
    isButtonMacroAvailable,
    type PluginButtonMacro,
} from "@modules/core/pluginButtonMacroRegistry";

interface MacroSelectProps {
    value: string;
    onChange: (value: string) => void;
    pluginMacros: PluginButtonMacro[];
    /** Filter which built-in macro options to show. Default: all. */
    filter?: (opt: { value: MacroType; label: string }) => boolean;
    /** Show border-warning class when the current macro is unavailable. Default: false. */
    showUnavailableWarning?: boolean;
    className?: string;
}

export default function MacroSelect({
    value,
    onChange,
    pluginMacros,
    filter,
    showUnavailableWarning,
    className,
}: MacroSelectProps) {
    const filtered = filter ? macroOptions.filter(filter) : macroOptions;
    const isUnavailable = showUnavailableWarning && !isButtonMacroAvailable(value);

    // Group plugin macros by plugin name
    const byPlugin = new Map<string, PluginButtonMacro[]>();
    for (const pm of pluginMacros) {
        const key = pm.pluginName || pm.pluginId;
        if (!byPlugin.has(key)) byPlugin.set(key, []);
        byPlugin.get(key)!.push(pm);
    }

    return (
        <Form.Select
            size="sm"
            value={value}
            onChange={e => onChange(e.target.value)}
            className={`${className || ''} ${isUnavailable ? 'border-warning' : ''}`.trim()}
        >
            {filtered.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
            {Array.from(byPlugin.entries()).map(([pluginName, macros]) => (
                <optgroup key={pluginName} label={pluginName}>
                    {macros.map(pm => (
                        <option key={pm.id} value={pm.id}>{pm.label}</option>
                    ))}
                </optgroup>
            ))}
            {value.startsWith('plugin:') && !isButtonMacroAvailable(value) && (
                <option value={value} disabled>
                    {value} (wtyczka niedostępna)
                </option>
            )}
        </Form.Select>
    );
}
