import { useEffect, useState } from "react";
import { Button, Check, DeleteButton, Input } from "@web-ui/primitives/index.ts";
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

function RadialPreview({ commands }: { commands: RadialCommandSetting[] }) {
    if (commands.length === 0) {
        return null;
    }
    const center = PREVIEW_SIZE / 2;
    const step = (Math.PI * 2) / commands.length;
    const startAngle = -Math.PI / 2;

    return (
        <div className="radial-preview" style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}>
            <div className="radial-preview__threshold" />
            {commands.map((cmd, index) => {
                const angle = startAngle + step * index;
                const label = cmd.label || cmd.command || `${index + 1}`;
                const displayLabel = label.length > 4 ? label.slice(0, 3) + ".." : label;
                return (
                    <div
                        key={cmd.id}
                        className="radial-preview__button"
                        title={label}
                        style={{
                            left: center + Math.cos(angle) * PREVIEW_RADIUS,
                            top: center + Math.sin(angle) * PREVIEW_RADIUS,
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
        <div ref={setNodeRef} className="settings-sort-item settings-sort-item--edit" style={style}>
            <span
                {...attributes}
                {...listeners}
                className={`settings-sort-item__handle${disabled ? " is-disabled" : ""}`}
            >
                &#x2630;
            </span>
            <Input
                value={cmd.label}
                placeholder="Nazwa przycisku"
                title="Etykieta"
                disabled={disabled}
                onChange={e => onUpdate(cmd.id, "label", e.target.value)}
            />
            <Input
                mono
                value={cmd.command}
                placeholder="Tekst komendy"
                title="Komenda"
                disabled={disabled}
                onChange={e => onUpdate(cmd.id, "command", e.target.value)}
            />
            <DeleteButton disabled={disabled} onClick={() => onRemove(cmd.id)} />
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
        <div className="ui-settings-stack">
            <Check
                id="mobile-radial-enabled"
                label="Włącz menu kołowe"
                checked={radialEnabled}
                onChange={event => setRadial(prev => ({ ...prev, enabled: event.target.checked }))}
            />
            {!radialEnabled && (
                <p className="popup-field__hint">Menu kołowe jest wyłączone. Włącz je, aby edytować komendy.</p>
            )}
            <div className="radial-editor">
                <div className="popup-field radial-editor__list">
                    <span className="popup-field__label">Komendy menu kołowego</span>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={commands.map(c => c.id)} strategy={verticalListSortingStrategy}>
                            <div className="settings-sort-list settings-sort-list--wide">
                                {commands.length === 0 && (
                                    <p className="popup-field__hint">Brak komend. Dodaj nową, aby pojawiła się w menu.</p>
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
                    <Button id="mobile-radial-add" size="sm" className="ui-settings-self-start" disabled={!radialEnabled} onClick={addRadialCommand}>
                        Dodaj komendę
                    </Button>
                </div>
                {radialEnabled && commands.length > 0 && (
                    <div className="popup-field radial-editor__preview">
                        <span className="popup-field__label">Podgląd</span>
                        <RadialPreview commands={commands} />
                    </div>
                )}
            </div>
        </div>
    );
}

export default MobileRadialCommands;
