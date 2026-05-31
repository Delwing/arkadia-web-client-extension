import { useRef } from "react";
import type { SoundCategory } from "@shared/events/clientEvents.ts";
import { saveCustomSounds, type CustomSound } from "@modules/core/customSounds";
import type { UiSettings } from "../../uiSettingsCore";
import { ALL_SOUND_CATEGORIES } from "../../uiSettingsCore";

interface SoundTabProps {
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

function SoundTab({ draft, update, customSounds, onCustomSoundsChange, previewKey, onManage }: SoundTabProps) {
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

    return (
        <>
            <div>
                <label className="form-label" htmlFor="ui-custom-beep-sound">Własny dźwięk beep</label>
                <select id="ui-custom-beep-sound" className="form-select" value={draft.customBeepSoundKey || ''} onChange={(e) => onBeepSelect(e.target.value)}>
                    <option value="">Domyślny beep</option>
                    {customSounds.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
                    <option value="__upload__">Dodaj dźwięk…</option>
                </select>
            </div>
            <div className="ui-sound-tiles">
                {ALL_SOUND_CATEGORIES.map(cat => (
                    <div key={cat} className="ui-sound-tile border rounded p-2 d-flex flex-column gap-1">
                        <div className="d-flex justify-content-between align-items-start gap-1">
                            <div className="d-flex flex-column" style={{ lineHeight: 1.15 }}>
                                <span className="small fw-semibold">{CATEGORY_TITLES[cat]}</span>
                                {CATEGORY_HINTS[cat] && (
                                    <span className="text-muted" style={{ fontSize: '0.65rem' }}>{CATEGORY_HINTS[cat]}</span>
                                )}
                            </div>
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary flex-shrink-0"
                                title="Odtwórz"
                                onClick={() => {
                                    const v = categoryValue(cat);
                                    if (v === '__disabled__') return;
                                    // For a "default beep" category, preview whatever the
                                    // (possibly unsaved) custom beep currently resolves to.
                                    previewKey(v || draft.customBeepSoundKey || 'beep');
                                }}
                            >
                                {'▶'}
                            </button>
                        </div>
                        <select id={`ui-sound-category-${cat}`} className="form-select form-select-sm" value={categoryValue(cat)} onChange={(e) => onCategorySelect(cat, e.target.value)}>
                            <option value="">Domyślny beep</option>
                            <option value="__disabled__">Wyciszony</option>
                            {customSounds.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
                            <option value="__upload__">Dodaj dźwięk…</option>
                        </select>
                    </div>
                ))}
            </div>
            <input ref={fileRef} id="ui-sound-category-file" type="file" accept="audio/*" style={{ display: 'none' }} onChange={onFileChange} />
            <button type="button" className="btn btn-secondary btn-sm align-self-start" id="ui-manage-sounds-button" onClick={onManage}>Zarządzaj dźwiękami</button>
        </>
    );
}

export default SoundTab;
