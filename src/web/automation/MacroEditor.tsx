import React, { useState } from 'react';
import { CustomSound } from '@modules/core/customSounds';
import {
    isTriggerMacroAvailable,
    type PluginTriggerMacro,
} from '@modules/core/pluginTriggerMacroRegistry';
import { Check, DeleteButton, Field, Input, Select } from '@web-ui/primitives/index.ts';
import type { UserMacro } from '@client/scripts/userTriggers';
import type { DimEasing } from '@client/ansi/FormatState';
import type { UserScript } from '@client/scripts/userScripts';
import { getAutomationGroups } from '@modules/core/automation';
import { globalStorage } from '@modules/core/storage';
import { ColorSlot } from './ColorSlot';

function storedScripts(): UserScript[] {
    const value = globalStorage.get('automationScripts');
    return Array.isArray(value) ? value.filter(s => s.id) : [];
}

/**
 * One action of an automation element: the type picker plus that type's
 * fields. Shared by the trigger and alias editors, which differ only in whether
 * there is a line to act on and which placeholders they offer.
 */

export interface MacroPlaceholder {
    /** Inserted as is, e.g. `{attacker}` or `$1`. */
    token: string;
    label: string;
}

export function normalizeMacro(macro: UserMacro): UserMacro {
    if (macro.type === 'beep' && (!macro.soundKey || typeof macro.soundKey !== 'string')) {
        return { ...macro, soundKey: 'beep' };
    }
    return macro;
}

/**
 * The placeholders an element offers, as buttons that append the token to a field.
 *
 * Appending rather than inserting at the caret on purpose: the caret position
 * is lost the moment the button takes focus, and restoring it reliably across
 * every field type is more machinery than this earns.
 */
function PlaceholderChips({
    placeholders,
    onInsert,
}: {
    placeholders: MacroPlaceholder[];
    onInsert: (token: string) => void;
}) {
    if (placeholders.length === 0) return null;
    return (
        <div className="trigger-arg-chips">
            <span className="popup-field__hint">Wstaw:</span>
            {placeholders.map(p => (
                <button
                    key={p.token}
                    type="button"
                    className="popup-btn popup-btn--sm trigger-arg-chips__chip"
                    title={p.label}
                    onClick={() => onInsert(p.token)}
                >
                    {p.token}
                </button>
            ))}
        </div>
    );
}

export function MacroEditor({
    macro,
    onChange,
    onRemove,
    sounds,
    onRequestSoundUpload,
    pluginMacros,
    lineless = false,
    placeholders = [],
    commandPlaceholder = 'Command',
}: {
    macro: UserMacro;
    onChange: (m: UserMacro) => void;
    onRemove: () => void;
    sounds: CustomSound[];
    onRequestSoundUpload: () => Promise<string | undefined>;
    pluginMacros: PluginTriggerMacro[];
    /**
     * No line of text to act on (an event, an alias): hides the actions that
     * edit a line and makes the message of notify/push/speak required.
     */
    lineless?: boolean;
    /** Tokens offered as insert buttons under the text fields. */
    placeholders?: MacroPlaceholder[];
    commandPlaceholder?: string;
}) {
    const notificationsSupported = typeof Notification !== 'undefined';
    const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(
        notificationsSupported ? Notification.permission : 'unsupported'
    );

    const requestNotificationPermission = async () => {
        if (!notificationsSupported) return;
        try {
            setNotifPermission(await Notification.requestPermission());
        } catch {
            setNotifPermission(Notification.permission);
        }
    };

    const available = isTriggerMacroAvailable(macro.type);

    return (
        <div className="trigger-action">
            <div className="trigger-action__main">
                <Select
                    value={macro.type}
                    className={available ? undefined : 'is-warning'}
                    onChange={e => {
                        const nextType = e.target.value;
                        onChange({
                            ...macro,
                            type: nextType,
                            soundKey: nextType === 'beep' ? macro.soundKey || 'beep' : undefined,
                            color: nextType === 'color' && macro.color === undefined && macro.background === undefined ? '#ffff00' : macro.color,
                            background: nextType === 'color' ? macro.background : undefined,
                            scriptId: nextType === 'script' ? macro.scriptId ?? storedScripts()[0]?.id : undefined,
                            groupId: nextType === 'group' ? macro.groupId ?? getAutomationGroups()[0]?.id : undefined,
                            groupState: nextType === 'group' ? macro.groupState ?? 'toggle' : undefined,
                        });
                    }}
                >
                    {!lineless && <option value="uppercase">Wielkie litery</option>}
                    {!lineless && <option value="color">Koloruj</option>}
                    {!lineless && <option value="replace">Zamień</option>}
                    {!lineless && <option value="wrap">Otocz tekstem</option>}
                    <option value="beep">Dźwięk</option>
                    <option value="mute">Wycisz dźwięki</option>
                    <option value="unmute">Włącz dźwięki</option>
                    <option value="command">Komenda</option>
                    <option value="notify">Powiadomienie</option>
                    <option value="push">Powiadomienie na telefon</option>
                    <option value="speak">Czytaj na głos</option>
                    <option value="echo">Wypisz tekst</option>
                    {!lineless && <option value="slowBlink">Wolne miganie</option>}
                    {!lineless && <option value="rapidBlink">Szybkie miganie</option>}
                    {!lineless && <option value="dim">Pulsowanie</option>}
                    <option value="functionalBind">Funkcyjny bind</option>
                    <option value="script">Uruchom skrypt</option>
                    <option value="group">Włącz / wyłącz grupę</option>
                    {(() => {
                        const byPlugin = new Map<string, typeof pluginMacros>();
                        for (const pm of pluginMacros) {
                            const key = pm.pluginName || pm.pluginId;
                            if (!byPlugin.has(key)) byPlugin.set(key, []);
                            byPlugin.get(key)!.push(pm);
                        }
                        return Array.from(byPlugin.entries()).map(([pluginName, macros]) => (
                            <optgroup key={pluginName} label={pluginName}>
                                {macros.map(pm => (
                                    <option key={pm.id} value={pm.id}>{pm.label}</option>
                                ))}
                            </optgroup>
                        ));
                    })()}
                    {macro.type.startsWith('plugin:') && !available && (
                        <option value={macro.type} disabled>
                            {macro.type} (wtyczka niedostępna)
                        </option>
                    )}
                </Select>
                {!available && (
                    <div className="popup-field__warning">
                        Ta wtyczka nie jest załadowana. Makro nie będzie działać.
                    </div>
                )}
                {macro.type === 'script' && (() => {
                    const scripts = storedScripts();
                    return scripts.length ? (
                        <>
                            <Select title="Skrypt" value={macro.scriptId ?? ''} onChange={e => onChange({ ...macro, scriptId: e.target.value })}>
                                {!scripts.some(sc => sc.id === macro.scriptId) && <option value={macro.scriptId ?? ''}>(brak skryptu)</option>}
                                {scripts.map(sc => <option key={sc.id} value={sc.id}>{sc.name || '(bez nazwy)'}</option>)}
                            </Select>
                            <div className="popup-field__hint">
                                Skrypt dostaje grupy z wzorca jako <code>args</code> ($1 to <code>args[0]</code>).
                            </div>
                        </>
                    ) : (
                        <div className="popup-field__warning">Nie ma jeszcze skryptów. Dodaj skrypt przyciskiem + w oknie Automatyzacja.</div>
                    );
                })()}
                {macro.type === 'group' && (() => {
                    const groups = getAutomationGroups();
                    return groups.length ? (
                        <div className="trigger-action__pair">
                            <Select
                                title="Co zrobić z grupą"
                                value={macro.groupState ?? 'toggle'}
                                onChange={e => onChange({ ...macro, groupState: e.target.value as UserMacro['groupState'] })}
                            >
                                <option value="on">Włącz</option>
                                <option value="off">Wyłącz</option>
                                <option value="toggle">Przełącz</option>
                            </Select>
                            <Select title="Grupa" value={macro.groupId ?? ''} onChange={e => onChange({ ...macro, groupId: e.target.value })}>
                                {!groups.some(g => g.id === macro.groupId) && <option value={macro.groupId ?? ''}>(brak grupy)</option>}
                                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </Select>
                        </div>
                    ) : (
                        <div className="popup-field__warning">Nie ma jeszcze grup. Utwórz grupę przyciskiem z folderem nad listą.</div>
                    );
                })()}
                {macro.type === 'beep' && (
                    <Select
                        value={macro.soundKey || 'beep'}
                        onChange={async e => {
                            const value = e.target.value;
                            if (value === '__upload__') {
                                const newKey = await onRequestSoundUpload();
                                if (newKey) {
                                    onChange({ ...macro, soundKey: newKey });
                                }
                                return;
                            }
                            onChange({ ...macro, soundKey: value });
                        }}
                    >
                        <option value="beep">Domyślny beep</option>
                        {sounds.map(sound => (
                            <option key={sound.key} value={sound.key}>{sound.name}</option>
                        ))}
                        <option value="__upload__">Dodaj dźwięk...</option>
                    </Select>
                )}
                {macro.type === 'command' && (
                    <>
                        <Input
                            mono
                            placeholder={commandPlaceholder}
                            value={macro.command || ''}
                            onChange={e => onChange({ ...macro, command: e.target.value })}
                        />
                        <PlaceholderChips
                            placeholders={placeholders}
                            onInsert={(token) => onChange({ ...macro, command: (macro.command ?? '') + token })}
                        />
                    </>
                )}
                {macro.type === 'push' && (
                    <>
                        <Input
                            mono
                            placeholder={lineless ? 'Treść powiadomienia' : 'Treść powiadomienia (puste = dopasowany tekst)'}
                            value={macro.message || ''}
                            onChange={e => onChange({ ...macro, message: e.target.value })}
                        />
                        <PlaceholderChips
                            placeholders={placeholders}
                            onInsert={(token) => onChange({ ...macro, message: (macro.message ?? '') + token })}
                        />
                        <Check
                            label="Wysyłaj zawsze (pomiń limit raz na minutę)"
                            checked={!!macro.bypassCooldown}
                            onChange={e => onChange({ ...macro, bypassCooldown: e.target.checked })}
                        />
                        <div className="popup-field__hint">
                            Wysyłane na sparowane urządzenia niezależnie od tego, czy patrzysz na klienta.
                            Domyślnie nie częściej niż raz na minutę — zaznacz powyżej dla alertów, których
                            nie chcesz stracić przez wcześniejsze powiadomienie. Wymaga sparowania
                            w Ustawieniach interfejsu → Powiadomienia.
                        </div>
                    </>
                )}
                {macro.type === 'speak' && (
                    <>
                        <Input
                            placeholder={lineless ? 'Tekst do przeczytania' : 'Tekst do przeczytania (puste = dopasowany tekst)'}
                            value={macro.message || ''}
                            onChange={e => onChange({ ...macro, message: e.target.value })}
                        />
                        <PlaceholderChips
                            placeholders={placeholders}
                            onInsert={(token) => onChange({ ...macro, message: (macro.message ?? '') + token })}
                        />
                        <div className="popup-field__hint">
                            {lineless
                                ? 'Czytane głosem syntezatora mowy.'
                                : <>Czytane głosem syntezatora mowy. <code>{'{1}'}</code>, <code>{'{2}'}</code>… wstawiają grupy z wzorca (np. <code>{'Atakuje cie (.+)!'}</code> → <code>{'Atak: {1}'}</code>).</>}
                            {' '}Głos, tempo i głośność ustawisz w Ustawieniach interfejsu → Dźwięk i powiadomienia.
                        </div>
                    </>
                )}
                {macro.type === 'echo' && (
                    <>
                        <Input
                            mono
                            placeholder="Tekst do wypisania"
                            value={macro.message || ''}
                            onChange={e => onChange({ ...macro, message: e.target.value })}
                        />
                        <PlaceholderChips
                            placeholders={placeholders}
                            onInsert={(token) => onChange({ ...macro, message: (macro.message ?? '') + token })}
                        />
                        <div className="popup-field__hint">
                            Wypisywane w oknie gry jako osobna linia, widoczna tylko dla ciebie.
                        </div>
                    </>
                )}
                {macro.type === 'notify' && (
                    <>
                        <Input
                            mono
                            placeholder={lineless ? 'Treść powiadomienia' : 'Treść powiadomienia (puste = dopasowany tekst)'}
                            value={macro.message || ''}
                            onChange={e => onChange({ ...macro, message: e.target.value })}
                        />
                        <PlaceholderChips
                            placeholders={placeholders}
                            onInsert={(token) => onChange({ ...macro, message: (macro.message ?? '') + token })}
                        />
                        {notifPermission !== 'granted' && (
                            <div className="popup-field__warning">
                                {notifPermission === 'unsupported'
                                    ? 'Powiadomienia systemowe nie są obsługiwane w tej przeglądarce. Powiadomienie pojawi się tylko w kliencie.'
                                    : notifPermission === 'denied'
                                        ? 'Powiadomienia systemowe są zablokowane w przeglądarce. Powiadomienie pojawi się tylko w kliencie.'
                                        : (
                                            <>
                                                Powiadomienia systemowe są wyłączone - powiadomienie pojawi się tylko w kliencie.{' '}
                                                <button type="button" className="popup-link" onClick={requestNotificationPermission}>
                                                    Włącz powiadomienia systemowe
                                                </button>
                                            </>
                                        )}
                            </div>
                        )}
                    </>
                )}
                {macro.type === 'functionalBind' && (
                    <>
                        <Input
                            mono
                            placeholder="Label (np. 'zabij cel')"
                            value={macro.label || ''}
                            onChange={e => onChange({ ...macro, label: e.target.value })}
                        />
                        <PlaceholderChips
                            placeholders={placeholders}
                            onInsert={(token) => onChange({ ...macro, label: (macro.label ?? '') + token })}
                        />
                        <Input
                            mono
                            placeholder="Command (np. 'zabij cel')"
                            value={macro.command || ''}
                            onChange={e => onChange({ ...macro, command: e.target.value })}
                        />
                        <PlaceholderChips
                            placeholders={placeholders}
                            onInsert={(token) => onChange({ ...macro, command: (macro.command ?? '') + token })}
                        />
                    </>
                )}
                {macro.type === 'dim' && (
                    <div className="trigger-action__grid">
                        <Field label="Jasność początkowa">
                            <Input
                                type="number"
                                min={0}
                                max={1}
                                step={0.1}
                                value={macro.dimStartOpacity ?? 1}
                                onChange={e => onChange({ ...macro, dimStartOpacity: parseFloat(e.target.value) })}
                            />
                        </Field>
                        <Field label="Jasność końcowa">
                            <Input
                                type="number"
                                min={0}
                                max={1}
                                step={0.1}
                                value={macro.dimEndOpacity ?? 0.3}
                                onChange={e => onChange({ ...macro, dimEndOpacity: parseFloat(e.target.value) })}
                            />
                        </Field>
                        <Field label="Czas (ms)">
                            <Input
                                type="number"
                                min={100}
                                step={100}
                                value={macro.dimDuration ?? 1000}
                                onChange={e => onChange({ ...macro, dimDuration: parseInt(e.target.value, 10) })}
                            />
                        </Field>
                        <Field label="Przejście">
                            <Select
                                value={macro.dimEasing ?? 'ease-in-out'}
                                onChange={e => onChange({ ...macro, dimEasing: e.target.value as DimEasing })}
                            >
                                <option value="linear">Liniowe</option>
                                <option value="ease">Ease</option>
                                <option value="ease-in">Ease In</option>
                                <option value="ease-out">Ease Out</option>
                                <option value="ease-in-out">Ease In-Out</option>
                            </Select>
                        </Field>
                    </div>
                )}
                {macro.type === 'wrap' && (
                    <>
                        <Input
                            mono
                            placeholder="Prefix"
                            value={macro.wrapPrefix || ''}
                            onChange={e => onChange({ ...macro, wrapPrefix: e.target.value })}
                        />
                        <Input
                            mono
                            placeholder="Suffix"
                            value={macro.wrapSuffix || ''}
                            onChange={e => onChange({ ...macro, wrapSuffix: e.target.value })}
                        />
                        <Select
                            value={macro.wrapScope || 'match'}
                            onChange={e => onChange({ ...macro, wrapScope: e.target.value as 'match' | 'line' })}
                        >
                            <option value="match">Dopasowanie</option>
                            <option value="line">Cała linia</option>
                        </Select>
                    </>
                )}
                {macro.type.startsWith('plugin:') && (() => {
                    const pluginMacro = pluginMacros.find(pm => pm.id === macro.type);
                    if (!pluginMacro?.configFields?.length) return null;
                    const config = macro.pluginConfig || {};
                    return pluginMacro.configFields.map(field => (
                        <React.Fragment key={field.name}>
                            {field.type === 'text' && (
                                <Input
                                    placeholder={field.label}
                                    value={config[field.name] ?? field.defaultValue ?? ''}
                                    onChange={e => onChange({
                                        ...macro,
                                        pluginConfig: { ...config, [field.name]: e.target.value }
                                    })}
                                />
                            )}
                            {field.type === 'number' && (
                                <Input
                                    type="number"
                                    placeholder={field.label}
                                    value={config[field.name] ?? field.defaultValue ?? 0}
                                    onChange={e => onChange({
                                        ...macro,
                                        pluginConfig: { ...config, [field.name]: Number(e.target.value) }
                                    })}
                                />
                            )}
                            {field.type === 'select' && field.options && (
                                <Select
                                    value={config[field.name] ?? field.defaultValue ?? ''}
                                    onChange={e => onChange({
                                        ...macro,
                                        pluginConfig: { ...config, [field.name]: e.target.value }
                                    })}
                                >
                                    {field.options.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </Select>
                            )}
                        </React.Fragment>
                    ));
                })()}
            </div>
            {(macro.type === 'color' || macro.type === 'echo') && (
                <div className="trigger-action__colors">
                    <ColorSlot
                        label={macro.type === 'color' ? 'Tekst' : 'Kolor'}
                        value={macro.color || undefined}
                        fallback="#ffff00"
                        onChange={color => onChange({ ...macro, color })}
                    />
                    {macro.type === 'color' && (
                        <ColorSlot
                            label="Tło"
                            value={macro.background || undefined}
                            fallback="#800000"
                            onChange={background => onChange({ ...macro, background })}
                        />
                    )}
                </div>
            )}
            {macro.type === 'replace' && (
                <Input
                    mono
                    className="trigger-action__replace"
                    placeholder="Replacement"
                    value={macro.to || ''}
                    onChange={e => onChange({ ...macro, to: e.target.value })}
                />
            )}
            <DeleteButton onClick={onRemove} title="Usuń akcję" />
        </div>
    );
}
