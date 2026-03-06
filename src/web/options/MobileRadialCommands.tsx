import { useEffect, useState, useCallback } from "react";
import { Button, Form } from "react-bootstrap";
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
    Settings,
    RadialCommandSetting,
} from "../mobileButtonSettings";
import { getClientInstance } from "@shared/runtime";

const ADD_BUTTON_ID = "mobile-radial-add";
const SAVE_BUTTON_ID = "mobile-radial-save";

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
        <div
            className="radial-preview mx-auto"
            style={{
                width: PREVIEW_SIZE,
                height: PREVIEW_SIZE,
                position: "relative",
                borderRadius: "50%",
                background: "rgba(15, 23, 42, 0.3)",
                border: "1px solid rgba(148, 163, 184, 0.3)",
            }}
        >
            {/* Threshold circle */}
            <div
                style={{
                    position: "absolute",
                    left: center,
                    top: center,
                    width: 24,
                    height: 24,
                    transform: "translate(-50%, -50%)",
                    borderRadius: "50%",
                    border: "1px solid rgba(148, 163, 184, 0.4)",
                    background: "rgba(15, 23, 42, 0.2)",
                }}
            />
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
                        style={{
                            position: "absolute",
                            left: x,
                            top: y,
                            width: PREVIEW_BUTTON_SIZE,
                            height: PREVIEW_BUTTON_SIZE,
                            transform: "translate(-50%, -50%)",
                            borderRadius: "50%",
                            background: cmd.color || "rgba(110, 180, 220, 0.85)",
                            color: cmd.fontColor || "#f1f5f9",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.5rem",
                            fontWeight: 600,
                            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.4)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
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
        <div
            ref={setNodeRef}
            className="border rounded p-2 d-flex flex-column flex-lg-row gap-2"
            style={{ ...style, background: 'var(--surface-raised)' }}
        >
            <div className="d-flex align-items-center">
                <span
                    {...attributes}
                    {...listeners}
                    className={disabled ? "text-muted opacity-50" : "text-muted"}
                    style={{ cursor: disabled ? 'not-allowed' : 'grab', userSelect: 'none', touchAction: 'none', fontSize: '1.2rem', padding: '0 0.25rem' }}
                >
                    &#x2630;
                </span>
            </div>
            <Form.Group className="flex-grow-1">
                <Form.Label className="small mb-1">Etykieta</Form.Label>
                <Form.Control
                    size="sm"
                    type="text"
                    value={cmd.label}
                    placeholder="Nazwa przycisku"
                    disabled={disabled}
                    onChange={e => onUpdate(cmd.id, "label", e.target.value)}
                />
            </Form.Group>
            <Form.Group className="flex-grow-1">
                <Form.Label className="small mb-1">Komenda</Form.Label>
                <Form.Control
                    size="sm"
                    type="text"
                    value={cmd.command}
                    placeholder="Tekst komendy"
                    disabled={disabled}
                    onChange={e => onUpdate(cmd.id, "command", e.target.value)}
                />
            </Form.Group>
            <div className="d-flex align-items-end">
                <Button
                    variant="danger"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onRemove(cmd.id)}
                >
                    Usuń
                </Button>
            </div>
        </div>
    );
}

function MobileRadialCommands() {
    const [settings, setSettings] = useState<Settings | null>(null);
    const radialEnabled = settings?.radial?.enabled !== false;

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    useEffect(() => {
        setSettings(loadSettings());
    }, []);

    const addRadialCommand = useCallback(() => {
        setSettings(prev => {
            if (!prev) {
                return prev;
            }
            const commands = prev.radial?.commands || [];
            return {
                ...prev,
                radial: {
                    ...prev.radial,
                    commands: [...commands, { id: createRadialId(), label: "", command: "" }],
                },
            };
        });
    }, []);

    const save = useCallback(() => {
        if (!settings) {
            return;
        }
        const enabled = settings.radial?.enabled !== false;
        const normalizedCommands = (settings.radial?.commands || []).reduce<RadialCommandSetting[]>((acc, cmd) => {
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
        const normalizedSettings: Settings = {
            ...settings,
            radial: {
                ...settings.radial,
                enabled,
                commands: normalizedCommands,
            },
        };
        setSettings(normalizedSettings);
        saveSettings(normalizedSettings);
        const extension = getClientInstance();
        const teamActive = !!extension?.TeamManager?.isInAnyTeam?.();
        const leaderActive = !!extension?.TeamManager?.isLeader?.();
        applySettings(normalizedSettings, teamActive, leaderActive);
        window.dispatchEvent(new Event("close-options"));
    }, [settings]);

    // Wire up footer buttons
    useEffect(() => {
        const addBtn = document.getElementById(ADD_BUTTON_ID);
        const saveBtn = document.getElementById(SAVE_BUTTON_ID);

        if (addBtn) {
            addBtn.onclick = addRadialCommand;
            (addBtn as HTMLButtonElement).disabled = !radialEnabled;
        }
        if (saveBtn) {
            saveBtn.onclick = save;
            (saveBtn as HTMLButtonElement).disabled = !settings;
        }

        return () => {
            if (addBtn) addBtn.onclick = null;
            if (saveBtn) saveBtn.onclick = null;
        };
    }, [addRadialCommand, save, radialEnabled, settings]);

    function setRadialEnabled(enabled: boolean) {
        setSettings(prev => {
            if (!prev) {
                return prev;
            }
            return {
                ...prev,
                radial: {
                    ...prev.radial,
                    enabled,
                },
            };
        });
    }

    function updateRadialCommand(id: string, field: "label" | "command", value: string) {
        setSettings(prev => {
            if (!prev) {
                return prev;
            }
            const commands = prev.radial?.commands || [];
            return {
                ...prev,
                radial: {
                    ...prev.radial,
                    commands: commands.map(cmd => (cmd.id === id ? { ...cmd, [field]: value } : cmd)),
                },
            };
        });
    }

    function removeRadialCommand(id: string) {
        setSettings(prev => {
            if (!prev) {
                return prev;
            }
            const commands = prev.radial?.commands || [];
            return {
                ...prev,
                radial: {
                    ...prev.radial,
                    commands: commands.filter(cmd => cmd.id !== id),
                },
            };
        });
    }

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setSettings(prev => {
                if (!prev) return prev;
                const commands = [...(prev.radial?.commands || [])];
                const oldIndex = commands.findIndex(cmd => cmd.id === active.id);
                const newIndex = commands.findIndex(cmd => cmd.id === over.id);
                if (oldIndex === -1 || newIndex === -1) return prev;
                return {
                    ...prev,
                    radial: {
                        ...prev.radial,
                        commands: arrayMove(commands, oldIndex, newIndex),
                    },
                };
            });
        }
    }

    const commands = settings?.radial?.commands || [];

    return (
        <div className="w-100 d-flex flex-column gap-3">
            <div className="d-flex flex-column gap-2">
                <Form.Check
                    type="switch"
                    id="mobile-radial-enabled"
                    label="Włącz menu kołowe"
                    checked={radialEnabled}
                    onChange={event => setRadialEnabled(event.target.checked)}
                />
                {!radialEnabled && (
                    <p className="text-muted small mb-0">
                        Menu kołowe jest wyłączone. Włącz je, aby edytować komendy.
                    </p>
                )}
            </div>
            {radialEnabled && commands.length > 0 && (
                <div className="mb-2">
                    <Form.Label className="mb-2 d-block text-center">Podglad</Form.Label>
                    <RadialPreview commands={commands} />
                </div>
            )}
            <div>
                <Form.Label className="mb-2">Komendy menu kołowego</Form.Label>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={commands.map(c => c.id)} strategy={verticalListSortingStrategy}>
                        <div className="d-flex flex-column gap-2">
                            {commands.length === 0 && (
                                <p className="text-muted small mb-0">Brak komend. Dodaj nową, aby pojawiła się w menu.</p>
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
        </div>
    );
}

export default MobileRadialCommands;
