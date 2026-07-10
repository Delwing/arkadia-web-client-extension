import { useEffect, useState, useRef, ChangeEvent } from "react";
import { Button, Form, Badge, Spinner } from "react-bootstrap";
import { Trash2, Pencil, ExternalLink, Upload, Sparkles } from "lucide-react";
import { Modal } from "bootstrap";
import { globalStorage } from "@modules/core/storage";
import { getPluginManager } from "@client/main";
import type { LoadedPlugin } from "@shared/types/Plugin";
import { storePluginScript, generatePluginId, deletePluginScript, getAllStoredPluginIds, getAllStoredPlugins } from "@client/utils/pluginStorage";
import { storeEditorPlugin, type EditorPluginData } from "@client/utils/pluginEditorStorage";
import { buildAiPluginPrompt } from "../aiPluginPrompt";
import type { PluginImportWorkerResponse } from "../pluginImport.shared";
import PluginImportWorker from "../pluginImport.worker?worker";

function Scripts() {
    const [scripts, setScripts] = useState<string[]>([]);
    const [storedScripts, setStoredScripts] = useState<string[]>([]);
    const [pluginInfo, setPluginInfo] = useState<Map<string, LoadedPlugin>>(new Map());
    const [storedPluginMetadata, setStoredPluginMetadata] = useState<Map<string, any>>(new Map());
    const [input, setInput] = useState("");
    const [codeModal, setCodeModal] = useState<Modal | null>(null);
    const [aiModal, setAiModal] = useState<Modal | null>(null);
    const [uploadStatus, setUploadStatus] = useState<{ message: string; type: 'success' | 'error' | 'loading' } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
        const savedScripts = globalStorage.get("scripts");
        if (Array.isArray(savedScripts)) {
            setScripts(savedScripts);
        }

        // Load stored scripts directly from IndexedDB instead of localStorage
        loadStoredScriptsFromDB();

        // Initialize Bootstrap modal
        const modalEl = document.getElementById('add-plugin-code-modal');
        let modal: Modal | null = null;
        if (modalEl) {
            modal = new Modal(modalEl);
            setCodeModal(modal);
        }

        const aiModalEl = document.getElementById('ai-plugin-modal');
        let aiModalInstance: Modal | null = null;
        if (aiModalEl) {
            aiModalInstance = new Modal(aiModalEl);
            setAiModal(aiModalInstance);
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
            if (aiModalInstance) {
                aiModalInstance.dispose();
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

    // Setup AI plugin modal handlers
    useEffect(() => {
        const copyBtn = document.getElementById('ai-plugin-copy');
        const gotoPasteBtn = document.getElementById('ai-plugin-goto-paste');
        const statusEl = document.getElementById('ai-plugin-copy-status');

        const handleCopy = async () => {
            const descriptionEl = document.getElementById('ai-plugin-description') as HTMLTextAreaElement;
            const description = descriptionEl?.value.trim();
            if (!description) {
                alert("Proszę opisać, co ma robić plugin");
                return;
            }
            try {
                await navigator.clipboard.writeText(buildAiPluginPrompt(description));
                if (statusEl) {
                    statusEl.style.display = '';
                    setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
                }
            } catch (error) {
                console.error("Failed to copy AI prompt:", error);
                alert("Nie udało się skopiować promptu do schowka");
            }
        };

        const handleGotoPaste = () => {
            aiModal?.hide();
            codeModal?.show();
        };

        copyBtn?.addEventListener('click', handleCopy);
        gotoPasteBtn?.addEventListener('click', handleGotoPaste);
        return () => {
            copyBtn?.removeEventListener('click', handleCopy);
            gotoPasteBtn?.removeEventListener('click', handleGotoPaste);
        };
    }, [aiModal, codeModal]);

    function save(list: string[]) {
        setScripts(list);
        globalStorage.set("scripts", list);
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
            globalStorage.set("stored_scripts", ids);

            // Reset form
            nameInput.value = "";
            codeTextarea.value = "";

            // Close modal
            console.log("[Scripts] Closing modal, codeModal:", codeModal);
            if (codeModal) {
                (document.activeElement as HTMLElement)?.blur?.();
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
                globalStorage.set("stored_scripts", ids);
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

    const handleZipUpload = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Reset input so same file can be selected again
        e.target.value = '';

        setUploadStatus({ message: 'Importowanie...', type: 'loading' });

        try {
            const arrayBuffer = await file.arrayBuffer();
            const worker = new PluginImportWorker();

            worker.onmessage = async (event: MessageEvent<PluginImportWorkerResponse>) => {
                const response = event.data;

                if (response.type === 'progress') {
                    setUploadStatus({ message: response.message, type: 'loading' });
                    return;
                }

                worker.terminate();

                if (response.type === 'error') {
                    setUploadStatus({ message: response.message, type: 'error' });
                    setTimeout(() => setUploadStatus(null), 5000);
                    return;
                }

                try {
                    const { id, name, compiled, files, folders, entryPoint, metadata } = response.plugin;

                    const now = Date.now();

                    // Store in Editor format (so it appears in Editor)
                    const editorPluginData: EditorPluginData = {
                        id,
                        name,
                        compiled,
                        files,
                        folders,
                        entryPoint,
                        metadata: metadata ? {
                            name: metadata.name,
                            version: metadata.version || '1.0.0',
                            author: metadata.author || 'Imported',
                            description: metadata.description || 'Imported from ZIP',
                        } : {
                            name,
                            version: '1.0.0',
                            author: 'Imported',
                            description: 'Imported from ZIP',
                        },
                        createdAt: now,
                        updatedAt: now,
                        lastCompiledAt: now,
                    };

                    await storeEditorPlugin(editorPluginData);

                    // Also store compiled JS for runtime
                    await storePluginScript(id, compiled, editorPluginData.metadata);

                    // Reload stored scripts list
                    await loadStoredScriptsFromDB();

                    // Trigger storage event to reload plugins
                    const ids = await getAllStoredPluginIds();
                    globalStorage.set("stored_scripts", ids);

                    // Trigger localStorage update for other tabs
                    localStorage.setItem('stored_scripts_updated', Date.now().toString());

                    setUploadStatus({
                        message: `Zaimportowano: ${name}`,
                        type: 'success',
                    });
                    setTimeout(() => setUploadStatus(null), 3000);
                } catch (err) {
                    console.error('Failed to store plugin:', err);
                    setUploadStatus({
                        message: 'Blad podczas zapisywania pluginu.',
                        type: 'error',
                    });
                    setTimeout(() => setUploadStatus(null), 5000);
                }
            };

            worker.onerror = (err) => {
                console.error('Worker error:', err);
                worker.terminate();
                setUploadStatus({ message: 'Blad podczas importu.', type: 'error' });
                setTimeout(() => setUploadStatus(null), 5000);
            };

            worker.postMessage({ type: 'import', file: arrayBuffer });
        } catch {
            setUploadStatus({ message: 'Nie udalo sie odczytac pliku.', type: 'error' });
            setTimeout(() => setUploadStatus(null), 5000);
        }
    };

    return (
        <div className="m-2 d-flex flex-column gap-2">
            <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleZipUpload}
                style={{ display: 'none' }}
            />
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
                <Button size="sm" variant="outline-primary" onClick={() => aiModal?.show()}>
                    <Sparkles size={14} className="me-1" />
                    Wygeneruj z AI
                </Button>
                <Button size="sm" variant="warning" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={14} className="me-1" />
                    Importuj ZIP
                </Button>
                <Button size="sm" variant="info" onClick={openEditor}>
                    <ExternalLink size={14} className="me-1" />
                    Edytor
                </Button>
            </div>
            {uploadStatus && (
                <div className={`alert alert-${uploadStatus.type === 'error' ? 'danger' : uploadStatus.type === 'loading' ? 'info' : 'success'} py-1 px-2 mb-0`} style={{ fontSize: '0.85rem' }}>
                    {uploadStatus.type === 'loading' && <Spinner animation="border" size="sm" className="me-2" />}
                    {uploadStatus.message}
                </div>
            )}

            <div className="d-flex flex-column gap-2">
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
                        <section key={identifier} className="character-settings-section" style={{ marginBottom: 0 }}>
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
                                            <Pencil size={16} />
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => remove(identifier)}
                                    >
                                        <Trash2 size={16} />
                                    </Button>
                                </div>
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}

export default Scripts;
