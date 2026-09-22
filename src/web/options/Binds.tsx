import { useEffect, useRef, useState } from "react";
import { Button, DeleteButton, Input, Select } from '@web-ui/primitives/index.ts';
import type { Bind, BindSettings, DirectionBinds, Keymap } from "@modules/core/keymapTypes";
import SubDialog from "../SubDialog";
import MultibindImport from "../imports/MultibindImport";
import {
    getKeymapStore,
    getKeymapList,
    getActiveKeymapId,
    saveKeymapBinds,
    switchKeymap,
    createKeymap,
    renameKeymap,
    deleteKeymap,
    defaultBinds,
    mergeBindSettings,
} from "@modules/core/keymapStorage";

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
const ALT_LABEL = isMac ? '⌥' : 'ALT';

function label(bind: Bind) {
    let key = bind.key;
    if (key.startsWith('Digit')) key = key.substring(5);
    else if (key.startsWith('Key')) key = key.substring(3);
    else if (key === 'BracketRight') key = ']';
    else if (key === 'BracketLeft') key = '[';
    else if (key === 'Backquote') key = '`';
    else if (key === 'Equal') key = '=';
    else if (key === 'Minus') key = '-';
    const parts: string[] = [];
    if (bind.ctrl) parts.push('CTRL');
    if (bind.alt) parts.push(ALT_LABEL);
    if (bind.shift) parts.push('SHIFT');
    parts.push(key);
    return parts.join('+');
}

/** Drops incomplete custom shortcuts (missing a key or a command) so an empty
 *  row left behind by "Dodaj skrót" is never persisted. */
function sanitizeBinds(binds: BindSettings): BindSettings {
    return {
        ...binds,
        custom: binds.custom.filter(b => b.command.trim() !== '' && b.key !== ''),
    };
}

type SimpleBindName = 'lamp' | 'attack' | 'support' | 'moveMode' | 'roomBind' | 'drinkable' | 'gateBind' | 'doubleK';

/** Read-only field that takes the next keypress (with modifiers) as the bind. */
function KeyCapture({ value, placeholder, onKeyDown }: {
    value: string;
    placeholder?: string;
    onKeyDown: (ev: React.KeyboardEvent) => void;
}) {
    return (
        <input
            type="text"
            readOnly
            className="popup-input popup-input--control bind-key"
            value={value}
            placeholder={placeholder ?? 'Klawisz…'}
            onKeyDown={onKeyDown}
        />
    );
}

/** A labelled bind. `stacked` puts the label over the key (compass cells). */
function BindRow({ label: text, value, placeholder, onKeyDown, onClear, stacked }: {
    label: string;
    value: string;
    placeholder?: string;
    onKeyDown: (ev: React.KeyboardEvent) => void;
    onClear?: () => void;
    stacked?: boolean;
}) {
    return (
        <div className={`bind-row${stacked ? ' bind-row--stacked' : ''}`}>
            <span className="bind-row__label">{text}</span>
            <div className="bind-row__keys">
                <KeyCapture value={value} placeholder={placeholder} onKeyDown={onKeyDown} />
                {onClear && (
                    <Button size="sm" variant="ghost" className="popup-btn--icon" title="Przywróć domyślny" onClick={onClear}>✕</Button>
                )}
            </div>
        </div>
    );
}

function Binds() {
    const [binds, setBinds] = useState<BindSettings>(defaultBinds);
    const [keymapList, setKeymapList] = useState<Keymap[]>([]);
    const [selectedKeymapId, setSelectedKeymapId] = useState<string>('');
    const [editingName, setEditingName] = useState(false);
    const [keymapNameDraft, setKeymapNameDraft] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
    function loadKeymap(keymapId?: string) {
        const list = getKeymapList();
        setKeymapList(list);

        const targetId = keymapId || getActiveKeymapId();
        setSelectedKeymapId(targetId);

        const store = getKeymapStore();
        const keymap = store.keymaps[targetId];
        if (keymap) {
            setBinds(mergeBindSettings(keymap.binds));
        } else if (list.length > 0) {
            setSelectedKeymapId(list[0].id);
            setBinds(mergeBindSettings(list[0].binds));
        } else {
            setBinds(defaultBinds);
        }
    }

    useEffect(() => {
        loadKeymap();
    }, []);

    function handleCapture(name: keyof BindSettings, ev: React.KeyboardEvent) {
        ev.preventDefault();
        const { code, ctrlKey, altKey, shiftKey } = ev;
        setBinds(prev => ({ ...prev, [name]: { key: code, ctrl: ctrlKey, alt: altKey, shift: shiftKey } }));
    }

    function handleCaptureOptional(name: 'mainGates' | 'mainTransport' | 'mainLoot', ev: React.KeyboardEvent) {
        ev.preventDefault();
        const { code, ctrlKey, altKey, shiftKey } = ev;
        setBinds(prev => ({ ...prev, [name]: { key: code, ctrl: ctrlKey, alt: altKey, shift: shiftKey } }));
    }

    function handleClearOptional(name: 'mainGates' | 'mainTransport' | 'mainLoot') {
        setBinds(prev => {
            const next = { ...prev };
            delete next[name];
            return next;
        });
    }

    function handleCaptureDir(dir: keyof DirectionBinds, ev: React.KeyboardEvent) {
        ev.preventDefault();
        const { code, ctrlKey, altKey, shiftKey } = ev;
        setBinds(prev => ({
            ...prev,
            directions: { ...prev.directions, [dir]: { key: code, ctrl: ctrlKey, alt: altKey, shift: shiftKey } },
        }));
    }

    function handleCaptureCustom(idx: number, ev: React.KeyboardEvent) {
        ev.preventDefault();
        const { code, ctrlKey, altKey, shiftKey } = ev;
        setBinds(prev => ({
            ...prev,
            custom: prev.custom.map((b, i) => i === idx ? { ...b, key: code, ctrl: ctrlKey, alt: altKey, shift: shiftKey } : b),
        }));
    }

    function handleCaptureTemp(idx: number, ev: React.KeyboardEvent) {
        ev.preventDefault();
        const { code, ctrlKey, altKey, shiftKey } = ev;
        setBinds(prev => ({
            ...prev,
            temp: prev.temp.map((b, i) => i === idx ? { key: code, ctrl: ctrlKey, alt: altKey, shift: shiftKey } : b),
        }));
    }

    function handleCaptureEnemy(idx: number, ev: React.KeyboardEvent) {
        ev.preventDefault();
        const { code, ctrlKey, altKey, shiftKey } = ev;
        setBinds(prev => ({
            ...prev,
            enemy: prev.enemy.map((b, i) => i === idx ? { key: code, ctrl: ctrlKey, alt: altKey, shift: shiftKey } : b),
        }));
    }

    function handleCaptureEnemyBlock(idx: number, ev: React.KeyboardEvent) {
        ev.preventDefault();
        const { code, ctrlKey, altKey, shiftKey } = ev;
        setBinds(prev => ({
            ...prev,
            enemyBlock: prev.enemyBlock.map((b, i) => i === idx ? { key: code, ctrl: ctrlKey, alt: altKey, shift: shiftKey } : b),
        }));
    }

    function handleCommandChange(idx: number, command: string) {
        setBinds(prev => ({
            ...prev,
            custom: prev.custom.map((b, i) => i === idx ? { ...b, command } : b),
        }));
    }

    function addCustomBind() {
        shouldScrollToNewCustom.current = true;
        setBinds(prev => ({ ...prev, custom: [...prev.custom, { key: '', command: '' }] }));
    }

    function removeCustomBind(idx: number) {
        setBinds(prev => ({
            ...prev,
            custom: prev.custom.filter((_, i) => i !== idx),
        }));
    }

    function save() {
        saveKeymapBinds(selectedKeymapId, sanitizeBinds(binds));
        window.dispatchEvent(new Event('close-options'));
    }

    function handleKeymapSwitch(keymapId: string) {
        // Save current edits to the current keymap before switching
        saveKeymapBinds(selectedKeymapId, sanitizeBinds(binds));

        setSelectedKeymapId(keymapId);
        const store = getKeymapStore();
        const keymap = store.keymaps[keymapId];
        if (keymap) {
            setBinds(mergeBindSettings(keymap.binds));
        }
        // Also activate this keymap for the current device
        switchKeymap(keymapId);
    }

    function handleCreateKeymap() {
        // Save current edits first
        saveKeymapBinds(selectedKeymapId, sanitizeBinds(binds));
        // Create new keymap carrying over currently shown bindings
        const newKeymap = createKeymap('Nowa mapa klawiszy', binds);
        // Switch to the new keymap
        switchKeymap(newKeymap.id);
        loadKeymap(newKeymap.id);
        // Start editing the name immediately
        setEditingName(true);
        setKeymapNameDraft(newKeymap.name);
    }

    function handleStartRename() {
        const current = keymapList.find(k => k.id === selectedKeymapId);
        if (current) {
            setEditingName(true);
            setKeymapNameDraft(current.name);
        }
    }

    function handleFinishRename() {
        if (keymapNameDraft.trim()) {
            renameKeymap(selectedKeymapId, keymapNameDraft.trim());
        }
        setEditingName(false);
        setKeymapList(getKeymapList());
    }

    function handleRenameKeyDown(ev: React.KeyboardEvent) {
        if (ev.key === 'Enter') {
            handleFinishRename();
        } else if (ev.key === 'Escape') {
            setEditingName(false);
        }
    }

    function handleDeleteKeymap() {
        if (deleteKeymap(selectedKeymapId)) {
            setShowDeleteConfirm(false);
            loadKeymap();
        }
    }

    function handleRestoreDefaults() {
        const restored = { ...structuredClone(defaultBinds), custom: binds.custom };
        delete restored.mainGates;
        delete restored.mainTransport;
        delete restored.mainLoot;
        setBinds(restored);
        setShowRestoreConfirm(false);
    }

    // Save and "Dodaj skrót" sit in the modal's footer, so they stay visible while
    // the bind list scrolls. Each shell (stock Bootstrap, forge MenuModal) hosts
    // its own chrome and reaches these handlers through window events; refs keep
    // the listeners bound to the latest closures without re-subscribing on every
    // keystroke. (The multibind import is <MultibindImport/> below.)
    const saveRef = useRef(save);
    saveRef.current = save;
    const addCustomBindRef = useRef(addCustomBind);
    addCustomBindRef.current = addCustomBind;
    useEffect(() => {
        const onSave = () => saveRef.current();
        const onAddCustom = () => addCustomBindRef.current();
        window.addEventListener('binds-save', onSave);
        window.addEventListener('binds-add-custom', onAddCustom);
        return () => {
            window.removeEventListener('binds-save', onSave);
            window.removeEventListener('binds-add-custom', onAddCustom);
        };
    }, []);

    // After "Dodaj skrót" (fired from the footer) appends a row, bring it into
    // view and focus its command input so the user can type straight away.
    const lastCustomRowRef = useRef<HTMLDivElement | null>(null);
    const shouldScrollToNewCustom = useRef(false);
    useEffect(() => {
        if (!shouldScrollToNewCustom.current) return;
        shouldScrollToNewCustom.current = false;
        const row = lastCustomRowRef.current;
        if (!row) return;
        row.scrollIntoView({ block: 'nearest' });
        row.querySelector('input')?.focus();
    }, [binds.custom.length]);

    const optionalRows: { name: 'mainGates' | 'mainTransport' | 'mainLoot'; label: string }[] = [
        { name: 'mainGates', label: 'Wrota' },
        { name: 'mainTransport', label: 'Transport' },
        { name: 'mainLoot', label: 'Zbieranie z cial' },
    ];
    const simpleRows: { name: SimpleBindName; label: string }[] = [
        { name: 'lamp', label: 'Napełnij lampę' },
        { name: 'attack', label: 'Atakuj' },
        { name: 'support', label: 'Wesprzyj' },
        { name: 'moveMode', label: 'Tryb ruchu' },
        { name: 'roomBind', label: 'Bind w lokacji' },
        { name: 'drinkable', label: 'Napij się wody' },
        { name: 'gateBind', label: 'Wrota' },
        { name: 'doubleK', label: 'Dwukrotne +k' },
    ];
    // Compass order, read row by row: NW N NE / W zerknij E / SW S SE.
    const compass: (keyof DirectionBinds)[] = ['nw', 'n', 'ne', 'w', 'zerknij', 'e', 'sw', 's', 'se'];
    const dirLabel = (dir: keyof DirectionBinds) =>
        dir === 'zerknij' ? 'Zerknij' : dir === 'special' ? 'Specjalne' : dir.toUpperCase();

    return (
        <div className="binds-editor">
            {/* Forge's "Importuj bazę multibindów" button still reaches it by event;
                the stock button opens Ustawienia → Import z innych klientów. */}
            <MultibindImport openEvent="binds-open-import" />

            <div className="binds-keymap">
                <label className="popup-field__label" htmlFor="binds-keymap-select">Mapa klawiszy</label>
                {editingName ? (
                    <Input
                        mono
                        className="binds-keymap__control"
                        value={keymapNameDraft}
                        onChange={ev => setKeymapNameDraft(ev.target.value)}
                        onBlur={handleFinishRename}
                        onKeyDown={handleRenameKeyDown}
                        data-dialog-escape="local"
                        autoFocus
                    />
                ) : (
                    <Select
                        id="binds-keymap-select"
                        className="binds-keymap__control"
                        value={selectedKeymapId}
                        onChange={ev => handleKeymapSwitch(ev.target.value)}
                    >
                        {keymapList.map(k => (
                            <option key={k.id} value={k.id}>{k.name}</option>
                        ))}
                    </Select>
                )}
                <div className="binds-keymap__actions">
                <Button size="sm" variant="ghost" onClick={handleStartRename} disabled={editingName}>Zmień nazwę</Button>
                <Button size="sm" variant="ghost" onClick={handleCreateKeymap} title="Nowa mapa (kopia bieżących bindów)">Nowa mapa</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowRestoreConfirm(true)} title="Przywróć domyślne bindy (zachowaj własne skróty)">
                    Przywróć domyślne
                </Button>
                <DeleteButton
                    title="Usuń mapę klawiszy"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={keymapList.length <= 1}
                />
                </div>
            </div>
            {showDeleteConfirm && (
                <SubDialog
                    size="sm"
                    title="Usunąć mapę klawiszy?"
                    onClose={() => setShowDeleteConfirm(false)}
                    footer={(
                        <>
                            <Button onClick={() => setShowDeleteConfirm(false)}>Anuluj</Button>
                            <Button variant="danger" onClick={handleDeleteKeymap}>Usuń</Button>
                        </>
                    )}
                >
                    Czy na pewno chcesz usunąć mapę klawiszy <strong>{keymapList.find(k => k.id === selectedKeymapId)?.name}</strong>?
                </SubDialog>
            )}
            {showRestoreConfirm && (
                <SubDialog
                    size="sm"
                    title="Przywrócić domyślne bindy?"
                    onClose={() => setShowRestoreConfirm(false)}
                    footer={(
                        <>
                            <Button onClick={() => setShowRestoreConfirm(false)}>Anuluj</Button>
                            <Button variant="solid" onClick={handleRestoreDefaults}>Przywróć</Button>
                        </>
                    )}
                >
                    Standardowe bindy zostaną przywrócone do wartości domyślnych. Własne skróty pozostaną bez zmian.
                </SubDialog>
            )}

            <p className="popup-field__hint binds-editor__hint">Kliknij pole i naciśnij klawisz (z CTRL / {ALT_LABEL} / SHIFT), aby przypisać skrót.</p>

            <section className="binds-section">
                <h6 className="binds-section__title">Funkcyjny</h6>
                <p className="popup-field__hint">
                    Jeden klawisz do tego, co akurat jest pod ręką: wrota, transport, zbieranie z ciał…
                    Wybranym sytuacjom możesz dać osobny klawisz — puste pole używa klawisza funkcyjnego.
                </p>
                <div className="binds-functional">
                    <BindRow label="Funkcyjny" value={label(binds.main)} onKeyDown={ev => handleCapture('main', ev)} />
                    <div className="binds-group">
                        <span className="popup-field__label">Osobny klawisz dla</span>
                        {optionalRows.map(row => (
                            <BindRow
                                key={row.name}
                                label={row.label}
                                value={binds[row.name] ? label(binds[row.name]!) : ''}
                                placeholder={label(binds.main)}
                                onKeyDown={ev => handleCaptureOptional(row.name, ev)}
                                onClear={binds[row.name] ? () => handleClearOptional(row.name) : undefined}
                            />
                        ))}
                    </div>
                </div>
            </section>

            <section className="binds-section">
                <h6 className="binds-section__title">Podstawowe</h6>
                <div className="binds-grid binds-grid--columns">
                    {simpleRows.map(row => (
                        <BindRow key={row.name} label={row.label} value={label(binds[row.name] as Bind)} onKeyDown={ev => handleCapture(row.name, ev)} />
                    ))}
                    {[0, 1].map(i => (
                        <BindRow key={`temp${i}`} label={`Tymczasowe ${i + 1}`} value={label(binds.temp[i])} onKeyDown={ev => handleCaptureTemp(i, ev)} />
                    ))}
                </div>
            </section>

            <section className="binds-section">
                <h6 className="binds-section__title">Wrogowie</h6>
                <div className="binds-grid binds-grid--columns">
                    {[0, 1, 2].map(i => (
                        <BindRow key={`enemy${i}`} label={`Atakuj wroga ${i + 1}`} value={label(binds.enemy[i])} onKeyDown={ev => handleCaptureEnemy(i, ev)} />
                    ))}
                    {[0, 1, 2].map(i => (
                        <BindRow key={`block${i}`} label={`Blokuj wroga ${i + 1}`} value={label(binds.enemyBlock[i])} onKeyDown={ev => handleCaptureEnemyBlock(i, ev)} />
                    ))}
                </div>
            </section>

            <section className="binds-section">
                <h6 className="binds-section__title">Kierunki</h6>
                <div className="binds-directions">
                    <div className="binds-compass">
                        {compass.map(dir => (
                            <BindRow key={dir} stacked label={dirLabel(dir)} value={label(binds.directions[dir])} onKeyDown={ev => handleCaptureDir(dir, ev)} />
                        ))}
                    </div>
                    <div className="binds-group">
                        {(['u', 'd', 'special'] as const).map(dir => (
                            <BindRow key={dir} label={dirLabel(dir)} value={label(binds.directions[dir])} onKeyDown={ev => handleCaptureDir(dir, ev)} />
                        ))}
                    </div>
                </div>
            </section>

            <section className="binds-section">
                <h6 className="binds-section__title">Własne skróty</h6>
                {binds.custom.length === 0 ? (
                    <p className="popup-field__hint">Brak własnych skrótów. Dodaj je przyciskiem „Dodaj skrót” na dole okna.</p>
                ) : (
                    <div className="binds-custom">
                        {binds.custom.map((b, idx) => (
                            <div key={idx} className="bind-row bind-row--custom" ref={idx === binds.custom.length - 1 ? lastCustomRowRef : undefined}>
                                <Input
                                    mono
                                    placeholder="Komenda"
                                    value={b.command}
                                    onChange={ev => handleCommandChange(idx, ev.target.value)}
                                />
                                <KeyCapture value={b.key ? label(b) : ''} onKeyDown={ev => handleCaptureCustom(idx, ev)} />
                                <DeleteButton onClick={() => removeCustomBind(idx)} />
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

export default Binds;
