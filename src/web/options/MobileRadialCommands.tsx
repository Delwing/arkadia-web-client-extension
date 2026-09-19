import { useEffect, useState } from "react";
import { Button, Input } from "@design";
import { CheckboxField, SettingsHint } from "@web/settings/controls.tsx";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    loadSettings,
    saveSettings,
    applySettings,
    RadialCommandSetting,
    RadialSettings,
} from "../mobileButtonSettings";
import { getTeamState } from "@modules/core/teamStateProvider";

function createRadialId() {
    const globalCrypto = typeof crypto !== "undefined" ? crypto : undefined;
    if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
        return globalCrypto.randomUUID();
    }
    return `radial-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

const PREVIEW_SIZE = 140;
const PREVIEW_RADIUS = 45;
const PREVIEW_BUTTON_SIZE = 28;

function RadialPreview({ commands }: { commands: RadialCommandSetting[] }) {
    if (commands.length === 0) {
        return null;
    }
    const center = PREVIEW_SIZE / 2;
    const step = (Math.PI * 2) / commands.length;
    const startAngle = -Math.PI / 2;

    return (
        <div className="radial-preview" style={{width: PREVIEW_SIZE, height: PREVIEW_SIZE}}>
            {/* Threshold circle */}
            <div className="radial-preview__threshold"/>
            {/* Command buttons */}
            {commands.map((cmd, index) => {
                const angle = startAngle + step * index;
                const x = center + Math.cos(angle) * PREVIEW_RADIUS;
                const y = center + Math.sin(angle) * PREVIEW_RADIUS;
                const label = cmd.label || cmd.command || `${index + 1}`;
                const displayLabel = label.length > 4 ? label.slice(0, 3) + ".." : label;
                return (
                    <div
                        key={cmd.id}
                        title={label}
                        className="radial-preview__command"
                        style={{
                            left: x,
                            top: y,
                            width: PREVIEW_BUTTON_SIZE,
                            height: PREVIEW_BUTTON_SIZE,
                            // The player picks these two per command; everything
                            // else on the preview is a token.
                            background: cmd.color || undefined,
                            color: cmd.fontColor || undefined,
                        }}
                    >
                        {displayLabel}
                    </div>
                );
            })}
        </div>
    );
}

interface SortableRadialItemProps {
    cmd: RadialCommandSetting;
    disabled: boolean;
    onUpdate: (id: string, field: "label" | "command", value: string) => void;
    onRemove: (id: string) => void;
}

function SortableRadialItem({ cmd, disabled, onUpdate, onRemove }: SortableRadialItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: cmd.id, disabled });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1 : 0,
    };

    return (
        <div ref={setNodeRef} className="settings-sortable-row" style={style}>
            <span
                {...attributes}
                {...listeners}
                className="settings-drag-handle"
                data-disabled={disabled ? "" : undefined}
                title="Przeciagnij, aby zmienic kolejnosc"
            >
                {"\u2630"}
            </span>
            <div className="settings-field settings-sortable-row__field">
                <label className="settings-field__label" htmlFor={`radial-label-${cmd.id}`}>Etykieta</label>
                <Input
                    id={`radial-label-${cmd.id}`}
                    type="text"
                    value={cmd.label}
                    placeholder="Nazwa przycisku"
                    disabled={disabled}
                    onChange={e => onUpdate(cmd.id, "label", e.target.value)}
                />
            </div>
            <div className="settings-field settings-sortable-row__field">
                <label className="settings-field__label" htmlFor={`radial-command-${cmd.id}`}>Komenda</label>
                <Input
                    id={`radial-command-${cmd.id}`}
                    type="text"
                    value={cmd.command}
                    placeholder="Tekst komendy"
                    disabled={disabled}
                    onChange={e => onUpdate(cmd.id, "command", e.target.value)}
                />
            </div>
            <Button variant="danger-soft" size="sm" disabled={disabled} onClick={() => onRemove(cmd.id)}>
                Usuń
            </Button>
        </div>
    );
}

function normalizeRadial(radial: RadialSettings): RadialSettings {
    const commands = (radial.commands || []).reduce<RadialCommandSetting[]>((acc, cmd) => {
        const command = (cmd.command || "").trim();
        if (!command) {
            return acc;
        }
        const label = (cmd.label || "").trim();
        acc.push({
            ...cmd,
            id: cmd.id || createRadialId(),
            label: label || command,
            command,
        });
        return acc;
    }, []);
    return { ...radial, enabled: radial.enabled !== false, commands };
}

/**
 * The "Menu kołowe" settings page. Edits stay local until the settings dialog's
 * Save runs the callback given to `registerSave`; the dialog remounts the
 * editor on open, which is how unsaved edits are dropped.
 */
function MobileRadialCommands({ registerSave }: { registerSave: (save: () => void) => void }) {
    const [stored] = useState(() => JSON.stringify(loadSettings().radial));
    const [radial, setRadial] = useState<RadialSettings>(() => JSON.parse(stored));
    const radialEnabled = radial.enabled !== false;
    const commands = radial.commands || [];

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    useEffect(() => {
        registerSave(() => {
            // Untouched: leave storage (and the live menu) alone.
            if (JSON.stringify(radial) === stored) return;
            // The rest of this entry belongs to "Przyciski mobilne", saved alongside.
            const next = { ...loadSettings(), radial: normalizeRadial(radial) };
            saveSettings(next);
            const { isInAnyTeam, isLeader } = getTeamState();
            applySettings(next, isInAnyTeam, isLeader);
        });
    }, [registerSave, radial, stored]);

    function updateCommands(update: (commands: RadialCommandSetting[]) => RadialCommandSetting[]) {
        setRadial(prev => ({ ...prev, commands: update(prev.commands || []) }));
    }

    function addRadialCommand() {
        updateCommands(list => [...list, { id: createRadialId(), label: "", command: "" }]);
    }

    function updateRadialCommand(id: string, field: "label" | "command", value: string) {
        updateCommands(list => list.map(cmd => (cmd.id === id ? { ...cmd, [field]: value } : cmd)));
    }

    function removeRadialCommand(id: string) {
        updateCommands(list => list.filter(cmd => cmd.id !== id));
    }

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        updateCommands(list => {
            const oldIndex = list.findIndex(cmd => cmd.id === active.id);
            const newIndex = list.findIndex(cmd => cmd.id === over.id);
            return oldIndex === -1 || newIndex === -1 ? list : arrayMove(list, oldIndex, newIndex);
        });
    }

    return (
        <div className="settings-stack">
            {/* A Checkbox, not a Switch: the design system reserves Switch for
                settings that take effect immediately, and this one is written
                by the dialog's Save button like every other field here. */}
            <CheckboxField
                id="mobile-radial-enabled"
                label="Włącz menu kołowe"
                checked={radialEnabled}
                onChange={checked => setRadial(prev => ({ ...prev, enabled: checked }))}
            />
            {!radialEnabled && (
                <SettingsHint>Menu kołowe jest wyłączone. Włącz je, aby edytować komendy.</SettingsHint>
            )}
            {radialEnabled && commands.length > 0 && (
                <div className="settings-field">
                    <span className="settings-field__label">Podglad</span>
                    <RadialPreview commands={commands} />
                </div>
            )}
            <div className="settings-field">
                <span className="settings-field__label">Komendy menu kołowego</span>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={commands.map(c => c.id)} strategy={verticalListSortingStrategy}>
                        <div className="settings-stack settings-stack--tight">
                            {commands.length === 0 && (
                                <SettingsHint>Brak komend. Dodaj nową, aby pojawiła się w menu.</SettingsHint>
                            )}
                            {commands.map(cmd => (
                                <SortableRadialItem
                                    key={cmd.id}
                                    cmd={cmd}
                                    disabled={!radialEnabled}
                                    onUpdate={updateRadialCommand}
                                    onRemove={removeRadialCommand}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            </div>
            <div className="settings-button-row">
                <Button id="mobile-radial-add" size="sm" disabled={!radialEnabled} onClick={addRadialCommand}>
                    Dodaj komendę
                </Button>
            </div>
        </div>
    );
}

export default MobileRadialCommands;
