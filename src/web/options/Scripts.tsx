import { useEffect, useState, ChangeEvent } from "react";
import { Button, Form, Badge, Spinner } from "react-bootstrap";
import { TiDelete } from "react-icons/ti";
import { FiEdit2, FiExternalLink } from "react-icons/fi";
import { Modal } from "bootstrap";
import storage from "@modules/core/storage";
import { getPluginManager } from "@client/main";
import type { LoadedPlugin } from "@shared/types/Plugin";
import { storePluginScript, generatePluginId, deletePluginScript, getAllStoredPluginIds, getAllStoredPlugins } from "@client/utils/pluginStorage";

function Scripts() {
    const [scripts, setScripts] = useState<string[]>([]);
    const [storedScripts, setStoredScripts] = useState<string[]>([]);
    const [pluginInfo, setPluginInfo] = useState<Map<string, LoadedPlugin>>(new Map());
    const [storedPluginMetadata, setStoredPluginMetadata] = useState<Map<string, any>>(new Map());
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

    // Load stored scripts from IndexedDB
    const loadStoredScriptsFromDB = async () => {
        try {
            const plugins = await getAllStoredPlugins();
            const ids = plugins.map(p => p.id);
            setStoredScripts(ids);

            // Also load metadata for stored plugins
            const metadataMap = new Map();
            plugins.forEach(plugin => {
                if (plugin.metadata) {
                    metadataMap.set(plugin.id, plugin.metadata);
                }
            });
            setStoredPluginMetadata(metadataMap);
        } catch (error) {
            console.error("Failed to load stored scripts from IndexedDB:", error);
        }
    };

    useEffect(() => {
        storage.getItem("scripts").then(res => {
            if (res && Array.isArray(res.scripts)) {
                setScripts(res.scripts);
            }
        });

        // Load stored scripts directly from IndexedDB instead of localStorage
        loadStoredScriptsFromDB();

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

            // Reload stored scripts list from IndexedDB
            await loadStoredScriptsFromDB();

            // Trigger storage event to reload plugins
            const ids = await getAllStoredPluginIds();
            storage.setItem("stored_scripts", ids);

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

    async function remove(identifier: string) {
        // Check if it's a stored plugin or URL
        if (storedScripts.includes(identifier)) {
            // Delete from IndexedDB
            try {
                await deletePluginScript(identifier);
                // Reload from IndexedDB to update the list
                await loadStoredScriptsFromDB();
                // Trigger storage event to reload plugins
                const ids = await getAllStoredPluginIds();
                storage.setItem("stored_scripts", ids);
            } catch (err) {
                console.error("Failed to delete plugin from IndexedDB:", err);
            }
        } else {
            // Remove from URL scripts
            const updated = scripts.filter(u => u !== identifier);
            save(updated);
        }
    }

    const allScripts = [...scripts, ...storedScripts];

    const openEditor = () => {
        window.open('editor/index.html', '_blank');
    };

    const editStoredPlugin = (pluginId: string) => {
        window.open(`editor/index.html?plugin=${pluginId}`, '_blank');
    };

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
                <Button size="sm" variant="info" onClick={openEditor}>
                    <FiExternalLink className="me-1" />
                    Otwórz edytor
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
                    const storedMetadata = storedPluginMetadata.get(identifier);

                    // Use metadata from IndexedDB for stored plugins if available
                    const displayInfo = hasPluginInfo ? plugin.info : storedMetadata;

                    return (
                        <li key={identifier} className="d-flex flex-column gap-1 mb-3">
                            <div className="d-flex align-items-center gap-2">
                                {isLoading && <Spinner animation="border" size="sm" />}

                                {displayInfo ? (
                                    <div className="d-flex flex-column">
                                        <div className="d-flex align-items-center gap-2">
                                            <strong>{displayInfo.name}</strong>
                                            <Badge bg="primary" pill>v{displayInfo.version}</Badge>
                                            {displayInfo.author && (
                                                <small className="text-muted">by {displayInfo.author}</small>
                                            )}
                                            {isStored && (
                                                <Badge bg="info" className="ms-2">Stored</Badge>
                                            )}
                                        </div>
                                        {displayInfo.description && (
                                            <small className="text-muted">{displayInfo.description}</small>
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

                                <div className="ms-auto d-flex gap-2">
                                    {isStored && (
                                        <Button
                                            size="sm"
                                            variant="outline-primary"
                                            onClick={() => editStoredPlugin(identifier)}
                                            title="Edytuj w edytorze"
                                        >
                                            <FiEdit2 />
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => remove(identifier)}
                                    >
                                        <TiDelete />
                                    </Button>
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

export default Scripts;
