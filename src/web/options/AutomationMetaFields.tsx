import { useId, useMemo } from 'react';
import { Check, Field, Input, Segmented } from '@web-ui/primitives/index.ts';
import {
    automationGroupName,
    ensureAutomationGroup,
    getAutomationGroups,
    withAutomationId,
    type AutomationMeta,
} from '@modules/core/automation';
import { collectCharacters } from './exportUtils';

/**
 * The fields every automation element shares (name, group, on/off, characters),
 * as the editors hold them while editing. The group is edited by name so a new
 * one can be typed in; it becomes an id only on save.
 */
export interface AutomationMetaDraft {
    name: string;
    enabled: boolean;
    groupName: string;
    /** `null` means every character. */
    characters: string[] | null;
}

export function automationMetaDraft(item?: AutomationMeta): AutomationMetaDraft {
    return {
        name: item?.name ?? '',
        enabled: item?.enabled !== false,
        groupName: automationGroupName(item?.group),
        characters: item?.characters?.length ? [...item.characters] : null,
    };
}

/**
 * The stored form of a draft, keeping `base`'s id (or assigning one). A group
 * name that does not exist yet creates the group, so call this only on save.
 * Defaults are left out rather than written, which keeps elements that never
 * used these fields byte-for-byte as they were.
 */
export function automationMetaFromDraft(draft: AutomationMetaDraft, base?: AutomationMeta): AutomationMeta {
    const meta: AutomationMeta = withAutomationId({ id: base?.id });
    const name = draft.name.trim();
    if (name) meta.name = name;
    const group = ensureAutomationGroup(draft.groupName);
    if (group) meta.group = group;
    if (!draft.enabled) meta.enabled = false;
    if (draft.characters?.length) meta.characters = draft.characters;
    return meta;
}

type Scope = 'all' | 'some';

export function AutomationMetaFields({
    value,
    onChange,
}: {
    value: AutomationMetaDraft;
    onChange: (value: AutomationMetaDraft) => void;
}) {
    const id = useId();
    const groups = useMemo(() => getAutomationGroups(), []);
    const known = useMemo(() => collectCharacters(), []);
    // A character picked on another device may not be known here yet; keep it listed.
    const characters = [...known, ...(value.characters ?? []).filter(c => !known.includes(c))];
    const set = (patch: Partial<AutomationMetaDraft>) => onChange({ ...value, ...patch });

    const toggleCharacter = (name: string, on: boolean) => {
        const current = value.characters ?? [];
        set({ characters: on ? [...current, name] : current.filter(c => c !== name) });
    };

    return (
        <div className="automation-meta">
            <div className="automation-meta__row">
                <Field label="Nazwa" htmlFor={`${id}-name`}>
                    <Input
                        id={`${id}-name`}
                        value={value.name}
                        placeholder="(opcjonalna)"
                        onChange={e => set({ name: e.target.value })}
                    />
                </Field>
                <Field label="Grupa" htmlFor={`${id}-group`}>
                    <Input
                        id={`${id}-group`}
                        list={`${id}-groups`}
                        value={value.groupName}
                        placeholder="Bez grupy"
                        onChange={e => set({ groupName: e.target.value })}
                    />
                    <datalist id={`${id}-groups`}>
                        {groups.map(g => <option key={g.id} value={g.name} />)}
                    </datalist>
                </Field>
            </div>
            <Check
                label="Wlaczony"
                checked={value.enabled}
                onChange={e => set({ enabled: e.target.checked })}
            />
            <Field label="Dla kogo">
                <Segmented<Scope>
                    value={value.characters ? 'some' : 'all'}
                    options={[
                        { value: 'all', label: 'Wszystkie postacie' },
                        { value: 'some', label: 'Wybrane' },
                    ]}
                    onChange={scope => set({ characters: scope === 'all' ? null : value.characters ?? [] })}
                />
                {value.characters && (
                    characters.length ? (
                        <div className="automation-meta__characters">
                            {characters.map(c => (
                                <Check
                                    key={c}
                                    label={c}
                                    checked={value.characters!.includes(c)}
                                    onChange={e => toggleCharacter(c, e.target.checked)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="popup-field__hint">
                            Brak zapisanych postaci. Beda dostepne po zalogowaniu na postac.
                        </div>
                    )
                )}
                {value.characters && value.characters.length === 0 && characters.length > 0 && (
                    <div className="popup-field__hint">Nie wybrano zadnej postaci - zapisze sie dla wszystkich.</div>
                )}
            </Field>
        </div>
    );
}
