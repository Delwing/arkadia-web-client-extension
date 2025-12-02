import { useEffect, useState } from "react";
import { Button, Form } from "react-bootstrap";
import {
    applySettings,
    createDefaultButton,
    createDefaultSettings,
    defaultBackgroundOpacity,
    defaultButtonColor,
    defaultFontColor,
    defaultFontSize,
    defaultHeight,
    defaultWidth,
    DesktopButtonSetting,
    DesktopButtonsSettings,
    DesktopMacroType,
    hexToRgba,
    ListGrowDirection,
    ListPosition,
    loadSettings,
    saveSettings,
} from "../desktopButtonSettings";

const listMacros = ['zList', 'zaList', 'wList', 'przeList', 'idzList'];

function isListMacro(macroType: DesktopMacroType): boolean {
    return listMacros.includes(macroType);
}

const macroOptions: { value: DesktopMacroType; label: string }[] = [
    { value: "command", label: "Wyślij komendę" },
    { value: "zList", label: "Lista /z" },
    { value: "zaList", label: "Lista /za" },
    { value: "wList", label: "Lista /w" },
    { value: "przeList", label: "Lista /prze" },
    { value: "idzList", label: "Lista idz" },
    { value: "wesprzyj", label: "Wesprzyj prowadzącego" },
    { value: "moveMode", label: "Tryb ruchu" },
    { value: "attackEnemy", label: "Atakuj wroga" },
    { value: "blockEnemy", label: "Zablokuj wroga" },
];

function DesktopButtons() {
    const [settings, setSettings] = useState<DesktopButtonsSettings>(createDefaultSettings);
    const [selected, setSelected] = useState<string | null>(null);

    useEffect(() => {
        loadSettings().then(setSettings);
    }, []);

    function nextId(): string {
        let max = 0;
        for (const btn of settings.buttons) {
            const match = /^desktop-btn-(\d+)$/.exec(btn.id);
            if (match) {
                max = Math.max(max, parseInt(match[1], 10));
            }
        }
        return `desktop-btn-${max + 1}`;
    }

    function addButton() {
        const id = nextId();
        const centerX = Math.round(window.innerWidth / 2 - defaultWidth / 2);
        const centerY = Math.round(window.innerHeight / 2 - defaultHeight / 2);
        const newBtn = createDefaultButton(id, centerX, centerY);
        setSettings(prev => ({
            ...prev,
            buttons: [...prev.buttons, newBtn],
        }));
        setSelected(id);
    }

    function removeButton(id: string) {
        setSettings(prev => ({
            ...prev,
            buttons: prev.buttons.filter(b => b.id !== id),
        }));
        if (selected === id) {
            setSelected(null);
        }
    }

    function updateButton(id: string, updates: Partial<DesktopButtonSetting>) {
        setSettings(prev => ({
            ...prev,
            buttons: prev.buttons.map(b => b.id === id ? { ...b, ...updates } : b),
        }));
    }

    function save() {
        saveSettings(settings);
        applySettings(settings);
        window.dispatchEvent(new Event('close-options'));
    }

    const selectedBtn = settings.buttons.find(b => b.id === selected) || null;

    function getButtonStyle(btn: DesktopButtonSetting): React.CSSProperties {
        return {
            width: `${btn.width}px`,
            height: `${btn.height}px`,
            backgroundColor: hexToRgba(btn.color, btn.backgroundOpacity),
            color: btn.fontColor,
            border: '1px solid rgba(160, 208, 224, 0.6)',
            borderRadius: '4px',
            fontSize: `${btn.fontSize}px`,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.25)',
            wordBreak: 'break-word',
            lineHeight: 1.2,
            padding: '4px 8px',
            cursor: 'default',
            flexShrink: 0,
        };
    }

    function getListItemStyle(btn: DesktopButtonSetting): React.CSSProperties {
        return {
            width: `${btn.width}px`,
            height: `${btn.height}px`,
            backgroundColor: hexToRgba(btn.color, btn.backgroundOpacity),
            color: btn.fontColor,
            border: '1px solid rgba(160, 208, 224, 0.6)',
            borderRadius: '4px',
            fontSize: `${btn.fontSize}px`,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.25)',
            cursor: 'default',
            flexShrink: 0,
        };
    }

    function renderPreview(btn: DesktopButtonSetting) {
        const buttonEl = (
            <button type="button" style={getButtonStyle(btn)}>
                {btn.label || '(pusty)'}
            </button>
        );

        if (!isListMacro(btn.macroType)) {
            return buttonEl;
        }

        const listPosition = btn.listPosition ?? 'bottom';
        const growDirection = btn.listGrowDirection ?? 'horizontal';

        // Determine flex direction for list items based on grow direction setting
        const listFlexDirection: 'row' | 'column' = growDirection === 'horizontal' ? 'row' : 'column';

        const listItems = (
            <div style={{
                display: 'flex',
                flexDirection: listFlexDirection,
                gap: '4px',
            }}>
                <div style={getListItemStyle(btn)}>1</div>
                <div style={getListItemStyle(btn)}>2</div>
            </div>
        );

        // Container direction based on list position
        const isListAboveOrBelow = listPosition === 'top' || listPosition === 'bottom';
        const containerStyle: React.CSSProperties = {
            display: 'flex',
            flexDirection: isListAboveOrBelow ? 'column' : 'row',
            alignItems: 'center',
            gap: '4px',
        };

        if (listPosition === 'top' || listPosition === 'left') {
            return (
                <div style={containerStyle}>
                    {listItems}
                    {buttonEl}
                </div>
            );
        } else {
            return (
                <div style={containerStyle}>
                    {buttonEl}
                    {listItems}
                </div>
            );
        }
    }

    return (
        <div className="w-100 position-relative">
            <div className="d-flex flex-column flex-sm-row flex-sm-wrap align-items-stretch align-items-sm-center gap-2 mb-3">
                <Button size="sm" variant="primary" onClick={addButton}>
                    + Dodaj przycisk
                </Button>
                <Form.Check
                    id="desktop-buttons-lock"
                    type="checkbox"
                    className="user-select-none ms-sm-auto text-nowrap"
                    label="Zablokuj przyciski"
                    checked={settings.locked}
                    onChange={e => setSettings(prev => ({ ...prev, locked: e.target.checked }))}
                />
            </div>

            {settings.buttons.length === 0 && (
                <p className="text-muted text-center mb-3">
                    Brak przycisków. Kliknij "Dodaj przycisk", aby utworzyć nowy.
                </p>
            )}

            {settings.buttons.length > 0 && (
                <div className="mb-3">
                    <Form.Label>Wybierz przycisk do edycji</Form.Label>
                    <div className="d-flex flex-wrap gap-2">
                        {settings.buttons.map(btn => (
                            <Button
                                key={btn.id}
                                size="sm"
                                variant={selected === btn.id ? 'primary' : 'outline-secondary'}
                                onClick={() => setSelected(btn.id)}
                                style={{
                                    backgroundColor: selected === btn.id ? undefined : btn.color,
                                    color: selected === btn.id ? undefined : btn.fontColor,
                                    borderColor: selected === btn.id ? undefined : btn.color,
                                }}
                            >
                                {btn.label || '(pusty)'}
                            </Button>
                        ))}
                    </div>
                </div>
            )}

            {selectedBtn && (
                <div className="border rounded p-3 mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6 className="mb-0">Edycja: {selectedBtn.label || selectedBtn.id}</h6>
                        <Button
                            size="sm"
                            variant="outline-danger"
                            onClick={() => removeButton(selectedBtn.id)}
                        >
                            Usuń
                        </Button>
                    </div>

                    <Form.Group className="mb-2">
                        <Form.Label>Etykieta</Form.Label>
                        <Form.Control
                            size="sm"
                            type="text"
                            value={selectedBtn.label}
                            onChange={e => updateButton(selectedBtn.id, { label: e.target.value })}
                        />
                    </Form.Group>

                    <Form.Group className="mb-2">
                        <Form.Label>Makro</Form.Label>
                        <Form.Select
                            size="sm"
                            value={selectedBtn.macroType}
                            onChange={e => updateButton(selectedBtn.id, { macroType: e.target.value as DesktopMacroType })}
                        >
                            {macroOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </Form.Select>
                    </Form.Group>

                    {selectedBtn.macroType === 'command' && (
                        <Form.Group className="mb-2">
                            <Form.Label>Komenda</Form.Label>
                            <Form.Control
                                as="textarea"
                                size="sm"
                                rows={2}
                                value={selectedBtn.command}
                                onChange={e => updateButton(selectedBtn.id, { command: e.target.value })}
                                placeholder="Wpisz komendę do wykonania"
                            />
                        </Form.Group>
                    )}

                    {(selectedBtn.macroType === 'attackEnemy' || selectedBtn.macroType === 'blockEnemy') && (
                        <Form.Group className="mb-2">
                            <Form.Label>Slot wroga</Form.Label>
                            <Form.Select
                                size="sm"
                                value={selectedBtn.enemySlot ?? 0}
                                onChange={e => updateButton(selectedBtn.id, { enemySlot: Number(e.target.value) })}
                            >
                                <option value={0}>Slot 1</option>
                                <option value={1}>Slot 2</option>
                                <option value={2}>Slot 3</option>
                            </Form.Select>
                        </Form.Group>
                    )}

                    {isListMacro(selectedBtn.macroType) && (
                        <>
                            <div className="row g-2 mb-2">
                                <div className="col-6">
                                    <Form.Group>
                                        <Form.Label>Pozycja listy</Form.Label>
                                        <Form.Select
                                            size="sm"
                                            value={selectedBtn.listPosition ?? 'bottom'}
                                            onChange={e => updateButton(selectedBtn.id, { listPosition: e.target.value as ListPosition })}
                                        >
                                            <option value="bottom">Na dole</option>
                                            <option value="top">Na górze</option>
                                            <option value="left">Po lewej</option>
                                            <option value="right">Po prawej</option>
                                        </Form.Select>
                                    </Form.Group>
                                </div>
                                <div className="col-6">
                                    <Form.Group>
                                        <Form.Label>Kierunek rozrostu</Form.Label>
                                        <Form.Select
                                            size="sm"
                                            value={selectedBtn.listGrowDirection ?? 'horizontal'}
                                            onChange={e => updateButton(selectedBtn.id, { listGrowDirection: e.target.value as ListGrowDirection })}
                                        >
                                            <option value="horizontal">Poziomo</option>
                                            <option value="vertical">Pionowo</option>
                                        </Form.Select>
                                    </Form.Group>
                                </div>
                            </div>
                            <Form.Check
                                id={`list-close-only-by-button-${selectedBtn.id}`}
                                type="checkbox"
                                className="mb-2"
                                label="Zamykaj tylko przyciskiem"
                                checked={selectedBtn.listCloseOnlyByButton ?? false}
                                onChange={e => updateButton(selectedBtn.id, { listCloseOnlyByButton: e.target.checked })}
                            />
                        </>
                    )}

                    <div className="row g-2 mb-2">
                        <div className="col-6">
                            <Form.Group>
                                <Form.Label>Kolor tła</Form.Label>
                                <div className="d-flex gap-2 align-items-center">
                                    <Form.Control
                                        size="sm"
                                        type="color"
                                        value={selectedBtn.color}
                                        onChange={e => updateButton(selectedBtn.id, { color: e.target.value })}
                                    />
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => updateButton(selectedBtn.id, { color: defaultButtonColor })}
                                    >
                                        ↺
                                    </Button>
                                </div>
                            </Form.Group>
                        </div>
                        <div className="col-6">
                            <Form.Group>
                                <Form.Label>Kolor czcionki</Form.Label>
                                <div className="d-flex gap-2 align-items-center">
                                    <Form.Control
                                        size="sm"
                                        type="color"
                                        value={selectedBtn.fontColor}
                                        onChange={e => updateButton(selectedBtn.id, { fontColor: e.target.value })}
                                    />
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => updateButton(selectedBtn.id, { fontColor: defaultFontColor })}
                                    >
                                        ↺
                                    </Button>
                                </div>
                            </Form.Group>
                        </div>
                    </div>

                    <Form.Group className="mb-2">
                        <Form.Label>
                            Przezroczystość tła: {Math.round(selectedBtn.backgroundOpacity * 100)}%
                        </Form.Label>
                        <div className="d-flex gap-2 align-items-center">
                            <Form.Range
                                className="flex-grow-1"
                                min={0}
                                max={100}
                                value={Math.round(selectedBtn.backgroundOpacity * 100)}
                                onChange={e => updateButton(selectedBtn.id, {
                                    backgroundOpacity: Number(e.target.value) / 100
                                })}
                            />
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => updateButton(selectedBtn.id, { backgroundOpacity: defaultBackgroundOpacity })}
                            >
                                ↺
                            </Button>
                        </div>
                    </Form.Group>

                    <div className="row g-2 mb-2">
                        <div className="col-4">
                            <Form.Group>
                                <Form.Label>Szerokość</Form.Label>
                                <div className="d-flex gap-2 align-items-center">
                                    <Form.Control
                                        size="sm"
                                        type="number"
                                        min={20}
                                        max={300}
                                        value={selectedBtn.width}
                                        onChange={e => updateButton(selectedBtn.id, {
                                            width: Math.max(20, Math.min(300, Number(e.target.value) || defaultWidth))
                                        })}
                                    />
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => updateButton(selectedBtn.id, { width: defaultWidth })}
                                    >
                                        ↺
                                    </Button>
                                </div>
                            </Form.Group>
                        </div>
                        <div className="col-4">
                            <Form.Group>
                                <Form.Label>Wysokość</Form.Label>
                                <div className="d-flex gap-2 align-items-center">
                                    <Form.Control
                                        size="sm"
                                        type="number"
                                        min={20}
                                        max={200}
                                        value={selectedBtn.height}
                                        onChange={e => updateButton(selectedBtn.id, {
                                            height: Math.max(20, Math.min(200, Number(e.target.value) || defaultHeight))
                                        })}
                                    />
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => updateButton(selectedBtn.id, { height: defaultHeight })}
                                    >
                                        ↺
                                    </Button>
                                </div>
                            </Form.Group>
                        </div>
                        <div className="col-4">
                            <Form.Group>
                                <Form.Label>Czcionka</Form.Label>
                                <div className="d-flex gap-2 align-items-center">
                                    <Form.Control
                                        size="sm"
                                        type="number"
                                        min={6}
                                        max={100}
                                        value={selectedBtn.fontSize}
                                        onChange={e => updateButton(selectedBtn.id, {
                                            fontSize: Math.max(6, Math.min(100, Number(e.target.value) || defaultFontSize))
                                        })}
                                    />
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => updateButton(selectedBtn.id, { fontSize: defaultFontSize })}
                                    >
                                        ↺
                                    </Button>
                                </div>
                            </Form.Group>
                        </div>
                    </div>

                    <div className="small text-muted mt-2">
                        Pozycja: X={Math.round(selectedBtn.x)}, Y={Math.round(selectedBtn.y)}
                        <br />
                        Przeciągnij przycisk na ekranie, aby zmienić jego pozycję.
                    </div>

                    <div className="mt-3 pt-3 border-top">
                        <Form.Label className="mb-2">Podgląd</Form.Label>
                        <div className="d-flex justify-content-center">
                            {renderPreview(selectedBtn)}
                        </div>
                    </div>
                </div>
            )}

            <div className="d-flex justify-content-end">
                <Button id="desktop-buttons-save" onClick={save}>Zapisz</Button>
            </div>
        </div>
    );
}

export default DesktopButtons;
