import { useEffect, useState } from "react";
import type { CustomSound } from "@modules/core/customSounds";
import type { PluginTriggerMacro } from "@modules/core/pluginTriggerMacroRegistry";
import {
    AUTOMATION_GROUPS_KEY,
    automationGroupName,
    getAutomationGroups,
    type AutomationGroup,
    type AutomationMeta,
} from "@modules/core/automation";
import { globalStorage } from "@modules/core/storage";
import type { UserMacro } from "./UserTriggers";

/** One chip per action, named as in the editor's action list. */
export function MacroChip({
    macro: m,
    customSounds,
    pluginMacros,
}: {
    macro: UserMacro;
    customSounds: CustomSound[];
    pluginMacros: PluginTriggerMacro[];
}) {
    let text: string;
    let swatch: string | undefined;
    switch (m.type) {
        case 'uppercase': text = 'Wielkie litery'; break;
        case 'color': text = 'Koloruj'; swatch = m.color; break;
        case 'replace': text = m.to ? `Zamien: ${m.to}` : 'Zamien'; break;
        case 'beep': {
            const key = m.soundKey || 'beep';
            const sound = key === 'beep' ? undefined : customSounds.find(s => s.key === key);
            text = key === 'beep' ? 'Dzwiek' : `Dzwiek: ${sound?.name ?? key}`;
            break;
        }
        case 'mute': text = 'Wycisz dzwieki'; break;
        case 'unmute': text = 'Wlacz dzwieki'; break;
        case 'command': text = m.command ? `Komenda: ${m.command}` : 'Komenda'; break;
        case 'slowBlink': text = 'Wolne miganie'; break;
        case 'rapidBlink': text = 'Szybkie miganie'; break;
        case 'dim': text = 'Pulsowanie'; break;
        case 'functionalBind': text = m.label && m.command ? `Bind [${m.label}]: ${m.command}` : 'Funkcyjny bind'; break;
        case 'notify': text = m.message ? `Powiadomienie: ${m.message}` : 'Powiadomienie'; break;
        case 'speak': text = m.message ? `Czytaj: ${m.message}` : 'Czytaj na glos'; break;
        case 'push': text = (m.message ? `Na telefon: ${m.message}` : 'Na telefon') + (m.bypassCooldown ? ' (zawsze)' : ''); break;
        case 'wrap': {
            const parts: string[] = [];
            if (m.wrapPrefix) parts.push(`"${m.wrapPrefix}" +`);
            parts.push(m.wrapScope === 'line' ? 'linia' : 'dopasowanie');
            if (m.wrapSuffix) parts.push(`+ "${m.wrapSuffix}"`);
            text = `Otocz: ${parts.join(' ')}`;
            break;
        }
        default:
            text = pluginMacros.find(pm => pm.id === m.type)?.label ?? m.type;
    }
    return (
        <span className="trigger-chip" title={text}>
            {swatch && <span className="trigger-chip__swatch" style={{ backgroundColor: swatch }} />}
            {text}
        </span>
    );
}

function charactersLabel(n: number): string {
    const few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20);
    return `${n} ${few ? 'postacie' : 'postaci'}`;
}

/** Name, group, off and character scope of an element, for its list card. */
export function AutomationBadges({ item, groups }: { item: AutomationMeta; groups: AutomationGroup[] }) {
    const group = automationGroupName(item.group, groups);
    const groupOff = !!item.group && groups.find(g => g.id === item.group)?.enabled === false;
    if (!item.name && !group && item.enabled !== false && !item.characters?.length) return null;
    return (
        <div className="automation-badges">
            {item.name && <span className="automation-badges__name">{item.name}</span>}
            {group && (
                <span className={`popup-badge${groupOff ? ' is-muted' : ''}`} title={groupOff ? 'Grupa wylaczona' : 'Grupa'}>
                    {group}
                </span>
            )}
            {item.enabled === false && <span className="popup-badge is-muted">wylaczony</span>}
            {item.characters?.length ? (
                <span className="popup-badge" title={item.characters.join(', ')}>
                    {item.characters.length === 1 ? item.characters[0] : charactersLabel(item.characters.length)}
                </span>
            ) : null}
        </div>
    );
}

/** The stored automation groups, kept current. */
export function useAutomationGroups(): AutomationGroup[] {
    const [groups, setGroups] = useState<AutomationGroup[]>(getAutomationGroups);
    useEffect(() => globalStorage.onChange(AUTOMATION_GROUPS_KEY, () => setGroups(getAutomationGroups())), []);
    return groups;
}

/** Whether an element is off, by itself or through its group. Characters aside. */
export function isSwitchedOff(item: AutomationMeta, groups: AutomationGroup[]): boolean {
    return item.enabled === false
        || (!!item.group && groups.find(g => g.id === item.group)?.enabled === false);
}

/** Text the list filter also matches besides the pattern: name, group, characters. */
export function automationSearchText(item: AutomationMeta, groups: AutomationGroup[]): string {
    return [item.name ?? "", automationGroupName(item.group, groups), ...(item.characters ?? [])]
        .join(" ")
        .toLowerCase();
}
