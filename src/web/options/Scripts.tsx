import { useEffect, useState, ChangeEvent } from "react";
import { Button, Form, Badge, Spinner } from "react-bootstrap";
import { TiDelete } from "react-icons/ti";
import { Modal } from "bootstrap";
import storage from "@modules/core/storage";
import { getPluginManager } from "@client/main";
import type { LoadedPlugin } from "@shared/types/Plugin";
import { storePluginScript, generatePluginId, deletePluginScript, getAllStoredPluginIds } from "@client/utils/pluginStorage";

function Scripts() {
    const [scripts, setScripts] = useState<string[]>([]);
    const [storedScripts, setStoredScripts] = useState<string[]>([]);
    const [pluginInfo, setPluginInfo] = useState<Map<string, LoadedPlugin>>(new Map());
    const [input, setInput] = useState("");
    const [codeModal, setCodeModal] = useState<Modal | null>(null);

    // Refresh plugin info from PluginManager
    const refreshPluginInfo = () => {
        const manager = getPluginManager();
        if (manager) {
            const loadedPlugins = manager.getLoadedPlugins();
            const map = new Map<string, LoadedPlugin>();
            loadedPlugins.forEach(plugin => {
                map.set(plugin.url, plugin);
            });
            setPluginInfo(map);
        }
    };

    useEffect(() => {
        storage.getItem("scripts").then(res => {
            if (res && Array.isArray(res.scripts)) {
                setScripts(res.scripts);
            }
        });

        storage.getItem("stored_scripts").then(res => {
            if (res && Array.isArray(res.stored_scripts)) {
                setStoredScripts(res.stored_scripts);
            }
        });

        // Initialize Bootstrap modal
        const modalEl = document.getElementById('add-plugin-code-modal');
        let modal: Modal | null = null;
        if (modalEl) {
            modal = new Modal(modalEl);
            setCodeModal(modal);
        }

        // Initial plugin info refresh
        refreshPluginInfo();

        // Listen for plugin events
        let handlePluginLoaded: (() => void) | null = null;
        let handlePluginError: (() => void) | null = null;
        let handlePluginDestroyed: (() => void) | null = null;

        if (window.client) {
            handlePluginLoaded = () => refreshPluginInfo();
            handlePluginError = () => refreshPluginInfo();
            handlePluginDestroyed = () => refreshPluginInfo();

            window.client.on('plugin:loaded', handlePluginLoaded);
            window.client.on('plugin:error', handlePluginError);
            window.client.on('plugin:destroyed', handlePluginDestroyed);
        }

        // Cleanup function
        return () => {
            if (modal) {
                modal.dispose();
            }
            if (window.client && handlePluginLoaded && handlePluginError && handlePluginDestroyed) {
                window.client.off('plugin:loaded', handlePluginLoaded);
                window.client.off('plugin:error', handlePluginError);
                window.client.off('plugin:destroyed', handlePluginDestroyed);
            }
        };
    }, []);

    // Setup modal submit handler
    useEffect(() => {
        const submitBtn = document.getElementById('plugin-code-submit');
        if (submitBtn) {
            submitBtn.addEventListener('click', handleModalSubmit);
            return () => {
                submitBtn.removeEventListener('click', handleModalSubmit);
            };
        }
    }, [storedScripts]); // Re-bind when storedScripts changes to capture latest state

    function save(list: string[]) {
        setScripts(list);
        storage.setItem("scripts", list);
    }

    function saveStored(list: string[]) {
        setStoredScripts(list);
        storage.setItem("stored_scripts", list);
    }

    function add() {
        const url = input.trim();
        if (!url) return;
        if (!scripts.includes(url)) {
            const updated = [...scripts, url];
            save(updated);
        }
        setInput("");
    }

    const handleModalSubmit = async () => {
        console.log("[Scripts] handleModalSubmit called");
        const nameInput = document.getElementById('plugin-code-name') as HTMLInputElement;
        const codeTextarea = document.getElementById('plugin-code-input') as HTMLTextAreaElement;

        if (!nameInput || !codeTextarea) {
            console.error("[Scripts] Modal inputs not found");
            return;
        }

        const code = codeTextarea.value.trim();
        const name = nameInput.value.trim();

        console.log("[Scripts] Code length:", code.length, "Name:", name);

        if (!code) {
            alert("Proszę wkleić kod pluginu");
            return;
        }

        try {
            // Generate a unique ID for the plugin
            const pluginId = generatePluginId(name || code);
            console.log("[Scripts] Generated plugin ID:", pluginId);

            // Store the plugin in IndexedDB
            await storePluginScript(pluginId, code);
            console.log("[Scripts] Plugin stored in IndexedDB");

            // Add to stored scripts list and update storage
            setStoredScripts(prev => {
                if (!prev.includes(pluginId)) {
                    const updated = [...prev, pluginId];
                    storage.setItem("stored_scripts", updated);
                    console.log("[Scripts] Updated stored scripts:", updated);
                    return updated;
                }
                return prev;
            });

            // Reset form
            nameInput.value = "";
            codeTextarea.value = "";

            // Close modal
            console.log("[Scripts] Closing modal, codeModal:", codeModal);
            if (codeModal) {
                codeModal.hide();
                console.log("[Scripts] Modal hide() called");
            } else {
                console.error("[Scripts] codeModal is null!");
            }
        } catch (error) {
            console.error("Failed to store plugin:", error);
            alert("Failed to store plugin: " + (error instanceof Error ? error.message : String(error)));
        }
    };

    function remove(identifier: string) {
        // Check if it's a stored plugin or URL
        if (storedScripts.includes(identifier)) {
            // Remove from stored scripts
            const updated = storedScripts.filter(id => id !== identifier);
            saveStored(updated);
            // Delete from IndexedDB
            deletePluginScript(identifier).catch(err => {
                console.error("Failed to delete plugin from IndexedDB:", err);
            });
        } else {
            // Remove from URL scripts
            const updated = scripts.filter(u => u !== identifier);
            save(updated);
        }
    }

    const allScripts = [...scripts, ...storedScripts];

    return (
        <div className="m-2 d-flex flex-column gap-2">
            <div className="d-flex flex-wrap gap-2 align-items-center">
                <Form.Control
                    type="text"
                    size="sm"
                    value={input}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            add();
                        }
                    }}
                    placeholder="URL skryptu"
                    style={{width: 'auto', flex: '1 1 auto', minWidth: '200px', maxWidth: '400px'}}
                />
                <Button size="sm" onClick={add}>Dodaj URL</Button>
                <Button size="sm" variant="success" onClick={() => codeModal?.show()}>
                    Wklej kod
                </Button>
            </div>

            <ul className="list-unstyled ms-3">
                {allScripts.map(identifier => {
                    const plugin = pluginInfo.get(identifier);
                    const hasPluginInfo = plugin?.info;
                    const isLoading = plugin?.status === 'loading';
                    const hasError = plugin?.status === 'error';
                    const isLegacy = plugin?.status === 'legacy';

                    const isStored = storedScripts.includes(identifier);

                    return (
                        <li key={identifier} className="d-flex flex-column gap-1 mb-3">
                            <div className="d-flex align-items-center gap-2">
                                {isLoading && <Spinner animation="border" size="sm" />}

                                {hasPluginInfo ? (
                                    <div className="d-flex flex-column">
                                        <div className="d-flex align-items-center gap-2">
                                            <strong>{plugin.info!.name}</strong>
                                            <Badge bg="primary" pill>v{plugin.info!.version}</Badge>
                                            {plugin.info!.author && (
                                                <small className="text-muted">by {plugin.info!.author}</small>
                                            )}
                                            {isStored && (
                                                <Badge bg="info" className="ms-2">Stored</Badge>
                                            )}
                                        </div>
                                        {plugin.info!.description && (
                                            <small className="text-muted">{plugin.info!.description}</small>
                                        )}
                                        {!isStored && (
                                            <small className="text-muted font-monospace">{identifier}</small>
                                        )}
                                    </div>
                                ) : (
                                    <div className="d-flex flex-column">
                                        <div className="d-flex align-items-center gap-2">
                                            <span className="font-monospace">{isStored ? "Stored Plugin" : identifier}</span>
                                            {isStored && (
                                                <Badge bg="info">Stored</Badge>
                                            )}
                                        </div>
                                        {isLegacy && (
                                            <Badge bg="secondary" className="align-self-start">Legacy Script</Badge>
                                        )}
                                        {hasError && (
                                            <small className="text-danger">{plugin.error}</small>
                                        )}
                                    </div>
                                )}

                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => remove(identifier)}
                                    className="ms-auto"
                                >
                                    <TiDelete />
                                </Button>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

export default Scripts;
