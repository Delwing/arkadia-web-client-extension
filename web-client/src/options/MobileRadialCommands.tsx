import { useEffect, useState } from "react";
import { Button, Form } from "react-bootstrap";
import {
    loadSettings,
    saveSettings,
    applySettings,
    Settings,
    RadialCommandSetting,
} from "../mobileButtonSettings";

function createRadialId() {
    const globalCrypto = typeof crypto !== "undefined" ? crypto : undefined;
    if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
        return globalCrypto.randomUUID();
    }
    return `radial-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function MobileRadialCommands() {
    const [settings, setSettings] = useState<Settings | null>(null);
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const [dragOverPosition, setDragOverPosition] = useState<"before" | "after" | null>(null);

    useEffect(() => {
        loadSettings().then(setSettings);
    }, []);

    function addRadialCommand() {
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

    function moveRadialCommand(
        sourceId: string,
        targetId: string | null,
        position: "before" | "after" = "after"
    ) {
        setSettings(prev => {
            if (!prev) {
                return prev;
            }
            const commands = prev.radial?.commands || [];
            const sourceIndex = commands.findIndex(cmd => cmd.id === sourceId);
            if (sourceIndex === -1) {
                return prev;
            }
            if (targetId === null) {
                if (sourceIndex === commands.length - 1) {
                    return prev;
                }
                const updated = [...commands];
                const [moved] = updated.splice(sourceIndex, 1);
                updated.push(moved);
                return {
                    ...prev,
                    radial: {
                        ...prev.radial,
                        commands: updated,
                    },
                };
            }
            const targetIndex = commands.findIndex(cmd => cmd.id === targetId);
            if (targetIndex === -1) {
                return prev;
            }
            let insertIndex = targetIndex + (position === "after" ? 1 : 0);
            if (sourceIndex < insertIndex) {
                insertIndex -= 1;
            }
            if (insertIndex === sourceIndex) {
                return prev;
            }
            const updated = [...commands];
            const [moved] = updated.splice(sourceIndex, 1);
            updated.splice(Math.max(insertIndex, 0), 0, moved);
            return {
                ...prev,
                radial: {
                    ...prev.radial,
                    commands: updated,
                },
            };
        });
    }

    function save() {
        if (!settings) {
            return;
        }
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
                commands: normalizedCommands,
            },
        };
        setSettings(normalizedSettings);
        saveSettings(normalizedSettings);
        const teamActive = !!(window as any).clientExtension?.TeamManager?.isInAnyTeam?.();
        const leaderActive = !!(window as any).clientExtension?.TeamManager?.isLeader?.();
        applySettings(normalizedSettings, teamActive, leaderActive);
        window.dispatchEvent(new Event("close-options"));
    }

    const commands = settings?.radial?.commands || [];

    return (
        <div className="w-100 d-flex flex-column gap-3">
            <div>
                <Form.Label className="mb-2">Komendy menu kołowego</Form.Label>
                <div className="d-flex flex-column gap-2">
                    {commands.length === 0 && (
                        <p className="text-muted small mb-0">Brak komend. Dodaj nową, aby pojawiła się w menu.</p>
                    )}
                    {commands.map(cmd => {
                        const isDragOver = dragOverId === cmd.id;
                        const overBefore = isDragOver && dragOverPosition === "before";
                        const overAfter = isDragOver && dragOverPosition === "after";
                        const isDragging = draggedId === cmd.id;
                        return (
                            <div
                                key={cmd.id}
                                className={`mobile-radial-command p-2 d-flex flex-column flex-md-row align-items-md-center gap-2${
                                    isDragOver ? " mobile-radial-command--drag-over" : ""
                                }${
                                    overBefore ? " mobile-radial-command--drag-over-before" : ""
                                }${overAfter ? " mobile-radial-command--drag-over-after" : ""}${
                                    isDragging ? " mobile-radial-command--dragging" : ""
                                }`}
                                onDragEnter={event => {
                                    if (!draggedId || draggedId === cmd.id) {
                                        return;
                                    }
                                    event.preventDefault();
                                    setDragOverId(cmd.id);
                                    setDragOverPosition(null);
                                }}
                                onDragOver={event => {
                                    if (!draggedId || draggedId === cmd.id) {
                                        return;
                                    }
                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = "move";
                                    const rect = event.currentTarget.getBoundingClientRect();
                                    const midpoint = rect.top + rect.height / 2;
                                    const position = event.clientY > midpoint ? "after" : "before";
                                    if (dragOverId !== cmd.id || dragOverPosition !== position) {
                                        setDragOverId(cmd.id);
                                        setDragOverPosition(position);
                                        moveRadialCommand(draggedId, cmd.id, position);
                                    }
                                }}
                                onDragLeave={event => {
                                    const nextTarget = event.relatedTarget as Node | null;
                                    if (nextTarget && event.currentTarget.contains(nextTarget)) {
                                        return;
                                    }
                                    if (dragOverId === cmd.id) {
                                        setDragOverId(null);
                                        setDragOverPosition(null);
                                    }
                                }}
                                onDrop={event => {
                                    if (!draggedId || draggedId === cmd.id) {
                                        return;
                                    }
                                    event.preventDefault();
                                    event.stopPropagation();
                                    moveRadialCommand(draggedId, cmd.id, dragOverPosition ?? "after");
                                    setDragOverId(null);
                                    setDragOverPosition(null);
                                    setDraggedId(null);
                                }}
                            >
                                <div className="d-flex flex-column flex-md-row gap-2 flex-grow-1">
                                    <Form.Control
                                        size="sm"
                                        type="text"
                                        value={cmd.label}
                                        placeholder="Nazwa przycisku"
                                        aria-label="Etykieta komendy menu kołowego"
                                        onChange={e => updateRadialCommand(cmd.id, "label", e.target.value)}
                                    />
                                    <Form.Control
                                        size="sm"
                                        type="text"
                                        value={cmd.command}
                                        placeholder="Tekst komendy"
                                        aria-label="Treść komendy menu kołowego"
                                        onChange={e => updateRadialCommand(cmd.id, "command", e.target.value)}
                                    />
                                </div>
                                <div className="d-flex align-items-center gap-2 flex-shrink-0">
                                    <Button
                                        variant="outline-secondary"
                                        size="sm"
                                        className="mobile-radial-command__drag-handle"
                                        draggable
                                        onDragStart={event => {
                                            event.dataTransfer.effectAllowed = "move";
                                            event.dataTransfer.setData("text/plain", cmd.id);
                                            setDraggedId(cmd.id);
                                        }}
                                        onDragEnd={() => {
                                            setDraggedId(null);
                                            setDragOverId(null);
                                            setDragOverPosition(null);
                                        }}
                                        aria-label="Przeciągnij, aby zmienić kolejność"
                                        title="Przeciągnij, aby zmienić kolejność"
                                    >
                                        <span aria-hidden="true">☰</span>
                                    </Button>
                                    <Button
                                        variant="outline-danger"
                                        size="sm"
                                        onClick={() => removeRadialCommand(cmd.id)}
                                    >
                                        Usuń
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                    {draggedId && commands.length > 0 && (
                        <div
                            className={`mobile-radial-command-dropzone${
                                dragOverId === "__end" ? " mobile-radial-command-dropzone--active" : ""
                            }`}
                            onDragEnter={event => {
                                if (!draggedId) {
                                    return;
                                }
                                event.preventDefault();
                                setDragOverId("__end");
                                setDragOverPosition("after");
                            }}
                            onDragOver={event => {
                                if (!draggedId) {
                                    return;
                                }
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                                moveRadialCommand(draggedId, null, "after");
                            }}
                            onDragLeave={event => {
                                const nextTarget = event.relatedTarget as Node | null;
                                if (nextTarget && event.currentTarget.contains(nextTarget)) {
                                    return;
                                }
                                if (dragOverId === "__end") {
                                    setDragOverId(null);
                                    setDragOverPosition(null);
                                }
                            }}
                            onDrop={event => {
                                if (!draggedId) {
                                    return;
                                }
                                event.preventDefault();
                                moveRadialCommand(draggedId, null, "after");
                                setDragOverId(null);
                                setDragOverPosition(null);
                                setDraggedId(null);
                            }}
                        >
                            Upuść tutaj, aby przenieść na koniec listy
                        </div>
                    )}
                </div>
                <Button variant="secondary" size="sm" className="mt-2" onClick={addRadialCommand}>
                    Dodaj komendę
                </Button>
            </div>
            <div className="d-flex justify-content-end">
                <Button onClick={save} disabled={!settings}>
                    Zapisz
                </Button>
            </div>
        </div>
    );
}

export default MobileRadialCommands;
