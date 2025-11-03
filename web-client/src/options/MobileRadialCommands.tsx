import { useEffect, useState } from "react";
import { Button, Form } from "react-bootstrap";
import {
    loadSettings,
    saveSettings,
    applySettings,
    Settings,
    RadialCommandSetting,
} from "../mobileButtonSettings";
import { getClientInstance } from "@shared/runtime";

function createRadialId() {
    const globalCrypto = typeof crypto !== "undefined" ? crypto : undefined;
    if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
        return globalCrypto.randomUUID();
    }
    return `radial-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function MobileRadialCommands() {
    const [settings, setSettings] = useState<Settings | null>(null);
    const radialEnabled = settings?.radial?.enabled !== false;

    useEffect(() => {
        loadSettings().then(setSettings);
    }, []);

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

    function save() {
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
            <div>
                <Form.Label className="mb-2">Komendy menu kołowego</Form.Label>
                <div className="d-flex flex-column gap-2">
                    {commands.length === 0 && (
                        <p className="text-muted small mb-0">Brak komend. Dodaj nową, aby pojawiła się w menu.</p>
                    )}
                    {commands.map(cmd => (
                        <div key={cmd.id} className="border rounded p-2 d-flex flex-column flex-lg-row gap-2">
                            <Form.Group className="flex-grow-1">
                                <Form.Label className="small mb-1">Etykieta</Form.Label>
                                <Form.Control
                                    size="sm"
                                    type="text"
                                    value={cmd.label}
                                    placeholder="Nazwa przycisku"
                                    disabled={!radialEnabled}
                                    onChange={e => updateRadialCommand(cmd.id, "label", e.target.value)}
                                />
                            </Form.Group>
                            <Form.Group className="flex-grow-1">
                                <Form.Label className="small mb-1">Komenda</Form.Label>
                                <Form.Control
                                    size="sm"
                                    type="text"
                                    value={cmd.command}
                                    placeholder="Tekst komendy"
                                    disabled={!radialEnabled}
                                    onChange={e => updateRadialCommand(cmd.id, "command", e.target.value)}
                                />
                            </Form.Group>
                            <div className="d-flex align-items-end">
                                <Button
                                    variant="outline-danger"
                                    size="sm"
                                    disabled={!radialEnabled}
                                    onClick={() => removeRadialCommand(cmd.id)}
                                >
                                    Usuń
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
                <Button
                    variant="secondary"
                    size="sm"
                    className="mt-2"
                    onClick={addRadialCommand}
                    disabled={!radialEnabled}
                >
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
