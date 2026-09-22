import { useRef } from "react";
import type { SoundCategory } from "@shared/events/clientEvents.ts";
import { saveCustomSounds, type CustomSound } from "@modules/core/customSounds";
import type { UiSettings } from "../../uiSettingsCore";
import { ALL_SOUND_CATEGORIES } from "../../uiSettingsCore";
import { Button, Field, Select } from "@web-ui/primitives/index.ts";
import { SettingsSection } from "../fields";

interface SoundSectionProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
    customSounds: CustomSound[];
    onCustomSoundsChange: (sounds: CustomSound[]) => void;
    previewKey: (key: string) => void;
    onManage: () => void;
}

const CATEGORY_TITLES: Record<SoundCategory, string> = {
    attack: 'Atak',
    hp: 'Punkty życia',
    fishing: 'Wędkarstwo',
    lamp: 'Lampa',
    gear: 'Sprzęt',
    transport: 'Transport',
    spell: 'Czary',
    block: 'Blokowanie',
    weapon: 'Broń',
    stun: 'Ogłuszenie',
};

const CATEGORY_HINTS: Partial<Record<SoundCategory, string>> = {
    hp: 'ostrzeżenie o niskim HP',
    gear: 'uszkodzony ekwipunek',
    weapon: 'wytracenie',
};

type UploadTarget = { type: 'beep' } | { type: 'category'; cat: SoundCategory };

function SoundSection({ draft, update, customSounds, onCustomSoundsChange, previewKey, onManage }: SoundSectionProps) {
    const fileRef = useRef<HTMLInputElement>(null);
    const pendingTarget = useRef<UploadTarget | null>(null);

    const triggerUpload = (target: UploadTarget) => {
        pendingTarget.current = target;
        fileRef.current?.click();
    };

    const setCategory = (cat: SoundCategory, key: string | null | undefined) => {
        const next = { ...(draft.soundCategories ?? {}) };
        if (key === undefined) {
            delete next[cat];
        } else {
            next[cat] = key;
        }
        update({ soundCategories: next });
    };

    const onCategorySelect = (cat: SoundCategory, value: string) => {
        if (value === '__upload__') {
            triggerUpload({ type: 'category', cat });
        } else if (value === '__disabled__') {
            setCategory(cat, null);
        } else if (value === '') {
            setCategory(cat, undefined);
        } else {
            setCategory(cat, value);
        }
    };

    const onBeepSelect = (value: string) => {
        if (value === '__upload__') {
            triggerUpload({ type: 'beep' });
        } else {
            update({ customBeepSoundKey: value || undefined });
        }
    };

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        e.target.value = '';
        const target = pendingTarget.current;
        pendingTarget.current = null;
        if (!file || !target) return;
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result !== 'string') return;
            const baseName = file.name.replace(/\.[^/.]+$/, '') || file.name;
            const existingKeys = new Set(customSounds.map(s => s.key));
            const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            const prefix = slug ? `user:${slug}` : `user:${Date.now()}`;
            let key = prefix;
            let counter = 1;
            while (existingKeys.has(key)) {
                key = `${prefix}-${counter++}`;
            }
            const sound: CustomSound = { key, name: baseName, data: result };
            const next = [...customSounds, sound];
            saveCustomSounds(next)
                .then(() => {
                    onCustomSoundsChange(next);
                    if (target.type === 'beep') {
                        update({ customBeepSoundKey: key });
                    } else {
                        setCategory(target.cat, key);
                    }
                })
                .catch(error => console.error('Failed to save custom sound', error));
        };
        reader.readAsDataURL(file);
    };

    const categoryValue = (cat: SoundCategory): string => {
        const v = draft.soundCategories?.[cat];
        if (v === null) return '__disabled__';
        if (typeof v === 'string' && v) return v;
        return '';
    };

    // What "Domyślny beep" actually plays: the built-in one, or the custom sound
    // that took its place. Named in the category options so the two settings read
    // as one, rather than a category quietly playing something else.
    const beepSound = draft.customBeepSoundKey
        ? customSounds.find(s => s.key === draft.customBeepSoundKey)
        : undefined;
    const beepOptionLabel = beepSound ? `Domyślny beep (${beepSound.name})` : 'Domyślny beep';

    return (
        <SettingsSection title="Dźwięki" full>
            <Field
                label="Własny dźwięk beep"
                htmlFor="ui-custom-beep-sound"
                hint="Zastępuje domyślny beep — gra wszędzie tam, gdzie kategoria niżej została na „Domyślny beep”."
            >
                <div className="popup-inline">
                    <Select id="ui-custom-beep-sound" className="settings-narrow" value={draft.customBeepSoundKey || ''} onChange={(e) => onBeepSelect(e.target.value)}>
                        <option value="">Domyślny beep</option>
                        {customSounds.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
                        <option value="__upload__">Dodaj dźwięk…</option>
                    </Select>
                    <Button size="sm" variant="ghost" title="Odtwórz" onClick={() => previewKey(draft.customBeepSoundKey || 'beep')}>{'▶'}</Button>
                    {draft.customBeepSoundKey && (
                        <Button id="ui-reset-beep-sound" size="sm" variant="ghost" onClick={() => update({ customBeepSoundKey: undefined })}>Przywróć domyślny</Button>
                    )}
                </div>
            </Field>
            <div className="settings-rows ui-sound-rows">
                {ALL_SOUND_CATEGORIES.map(cat => (
                    <div key={cat} className="settings-row">
                        <label className="popup-field__label" htmlFor={`ui-sound-category-${cat}`}>
                            {CATEGORY_TITLES[cat]}
                            {CATEGORY_HINTS[cat] && <span className="settings-inline-note">{CATEGORY_HINTS[cat]}</span>}
                        </label>
                        <div className="popup-inline">
                            <Select id={`ui-sound-category-${cat}`} className="settings-narrow" value={categoryValue(cat)} onChange={(e) => onCategorySelect(cat, e.target.value)}>
                                <option value="">{beepOptionLabel}</option>
                                <option value="__disabled__">Wyciszony</option>
                                {customSounds.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
                                <option value="__upload__">Dodaj dźwięk…</option>
                            </Select>
                            <Button
                                size="sm"
                                variant="ghost"
                                title="Odtwórz"
                                disabled={categoryValue(cat) === '__disabled__'}
                                onClick={() => {
                                    // For a "default beep" category, preview whatever the
                                    // (possibly unsaved) custom beep currently resolves to.
                                    previewKey(categoryValue(cat) || draft.customBeepSoundKey || 'beep');
                                }}
                            >
                                {'▶'}
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
            <input ref={fileRef} id="ui-sound-category-file" type="file" accept="audio/*" hidden onChange={onFileChange} />
            <Button size="sm" className="ui-settings-self-start" id="ui-manage-sounds-button" onClick={onManage}>Zarządzaj dźwiękami</Button>
        </SettingsSection>
    );
}

export default SoundSection;
