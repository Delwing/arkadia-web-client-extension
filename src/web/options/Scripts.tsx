import { useEffect, useState, useRef, ChangeEvent, type ReactNode } from "react";
import { Button, Form, Badge, Spinner } from "react-bootstrap";
import { Trash2, Pencil, ExternalLink, Upload, Sparkles } from "lucide-react";
import { globalStorage } from "@modules/core/storage";
import { getPluginManager } from "@client/main";
import type { LoadedPlugin } from "@shared/types/Plugin";
import { storePluginScript, generatePluginId, deletePluginScript, getAllStoredPluginIds, getAllStoredPlugins } from "@client/utils/pluginStorage";
import { storeEditorPlugin, deleteEditorPlugin, createEditorPluginFromSource, type EditorPluginData } from "@client/utils/pluginEditorStorage";
import { buildAiPluginPrompt } from "../aiPluginPrompt";
import { editorUrl } from "../appUrls";
import type { PluginImportWorkerResponse } from "../pluginImport.shared";
import PluginImportWorker from "../pluginImport.worker?worker";

/**
 * A sub-dialog rendered *inline*, over whichever modal hosts this panel — the
 * same hand-rolled shell the alias/trigger editors and CollectOverridesModal use,
 * and for the same two reasons.
 *
 * It replaces markup that used to live in stock's index.html and be driven by id
 * (`#add-plugin-code-modal`, `#ai-plugin-modal`): those shells exist only in the
 * stock page, so under forge — which hosts this very component in its own menu
 * modal — every button that reached for them was a silent no-op.
 *
 * The obvious replacement, a react-bootstrap `<Modal>`, does not work here: it
 * portals to `document.body`, and inside stock's Bootstrap `#scripts-modal` the
 * two focus managers then fight over the portaled node — Bootstrap's FocusTrap
 * pulls focus back into the parent dialog while react-overlays' `enforceFocus`
 * pulls it back to the child, and the net effect is that focus sticks on the
 * child's close button and its inputs cannot be typed into at all. Rendering
 * inline sidesteps that (no portal, no second focus trap), and in forge it also
 * keeps the dialog inside `.forge-menu-modal`, so the scoped Bootstrap sheet and
 * forge's palette reach it without the portal-tagging workaround.
 */
function SubDialog({ title, onClose, footer, children }: {
    title: string;
    onClose: () => void;
    footer: ReactNode;
    children: ReactNode;
}) {
    return (
        <div
            className="modal show d-block"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1060 }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable" style={{ zIndex: 1061 }}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title">{title}</h5>
                        <button type="button" className="btn-close" onClick={onClose} />
                    </div>
                    <div className="modal-body">{children}</div>
                    <div className="modal-footer">{footer}</div>
                </div>
            </div>
        </div>
    );
}

function Scripts() {
    const [scripts, setScripts] = useState<string[]>([]);
    const [storedScripts, setStoredScripts] = useState<string[]>([]);
    const [pluginInfo, setPluginInfo] = useState<Map<string, LoadedPlugin>>(new Map());
    const [storedPluginMetadata, setStoredPluginMetadata] = useState<Map<string, any>>(new Map());
    const [input, setInput] = useState("");
    // The "Wklej kod" / "Wygeneruj z AI" dialogs are owned by this component now
    // (see SubDialog above) instead of being host-page markup driven by id.
    const [showCodeModal, setShowCodeModal] = useState(false);
    const [showAiModal, setShowAiModal] = useState(false);
    const [pluginName, setPluginName] = useState("");
    const [pluginCode, setPluginCode] = useState("");
    const [aiDescription, setAiDescription] = useState("");
    const [aiCopied, setAiCopied] = useState(false);
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
            if (window.client && handlePluginLoaded && handlePluginError && handlePluginDestroyed) {
                window.client.off('plugin:loaded', handlePluginLoaded);
                window.client.off('plugin:error', handlePluginError);
                window.client.off('plugin:destroyed', handlePluginDestroyed);
            }
        };
    }, []);

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
        const code = pluginCode.trim();
        const name = pluginName.trim();

        if (!code) {
            alert("Proszę wkleić kod pluginu");
            return;
        }

        try {
            // Generate a unique ID for the plugin
            const pluginId = generatePluginId(name || code);

            const metadata = {
                name: name || "Wklejony plugin",
                version: '1.0.0',
                author: 'Wklejony kod',
                description: 'Dodany przez "Wklej kod"',
            };

            // Store the plugin in IndexedDB
            await storePluginScript(pluginId, code, metadata);

            // Also store an editor record under the same id, so the pasted code
            // can be opened and edited in the plugin editor (it reads a separate
            // database and would otherwise report "Plugin not found").
            await storeEditorPlugin(
                createEditorPluginFromSource(pluginId, metadata.name, code, metadata)
            );

            // Reload stored scripts list from IndexedDB
            await loadStoredScriptsFromDB();

            // Trigger storage event to reload plugins
            const ids = await getAllStoredPluginIds();
            globalStorage.set("stored_scripts", ids);

            setPluginName("");
            setPluginCode("");
            setShowCodeModal(false);
        } catch (error) {
            console.error("Failed to store plugin:", error);
            alert("Failed to store plugin: " + (error instanceof Error ? error.message : String(error)));
        }
    };

    const handleAiCopy = async () => {
        const description = aiDescription.trim();
        if (!description) {
            alert("Proszę opisać, co ma robić plugin");
            return;
        }
        try {
            await navigator.clipboard.writeText(buildAiPluginPrompt(description));
            setAiCopied(true);
            setTimeout(() => setAiCopied(false), 3000);
        } catch (error) {
            console.error("Failed to copy AI prompt:", error);
            alert("Nie udało się skopiować promptu do schowka");
        }
    };

    async function remove(identifier: string) {
        // Check if it's a stored plugin or URL
        if (storedScripts.includes(identifier)) {
            // Delete from IndexedDB
            try {
                await deletePluginScript(identifier);
                // Drop the editor record too, otherwise the deleted plugin keeps
                // showing up in the editor's plugin list.
                await deleteEditorPlugin(identifier);
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

    // Resolved against the client root, not the current document: the forge UI is
    // served from `<root>/forge-ui/`, where a relative `editor/index.html` would
    // 404 (there is no editor nested under the sub-apps). See ../appUrls.ts.
    const openEditor = () => {
        window.open(editorUrl(), '_blank');
    };

    const editStoredPlugin = (pluginId: string) => {
        window.open(editorUrl(pluginId), '_blank');
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
                <Button size="sm" variant="success" onClick={() => setShowCodeModal(true)}>
                    Wklej kod
                </Button>
                <Button size="sm" variant="outline-primary" onClick={() => setShowAiModal(true)}>
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

            {showCodeModal && (
                <SubDialog
                    title="Dodaj plugin z kodu"
                    onClose={() => setShowCodeModal(false)}
                    footer={(
                        <>
                            <Button variant="secondary" onClick={() => setShowCodeModal(false)}>Anuluj</Button>
                            <Button variant="primary" onClick={handleModalSubmit}>Dodaj plugin</Button>
                        </>
                    )}
                >
                    <Form.Group className="mb-3">
                        <Form.Label>Nazwa pluginu (opcjonalnie)</Form.Label>
                        <Form.Control
                            type="text"
                            value={pluginName}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setPluginName(e.target.value)}
                            placeholder="Moja wtyczka"
                            autoComplete="off"
                        />
                    </Form.Group>
                    <Form.Group>
                        <Form.Label>Kod JavaScript</Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={15}
                            value={pluginCode}
                            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setPluginCode(e.target.value)}
                            placeholder="export async function init(api) { ... }"
                            autoComplete="off"
                            style={{ fontFamily: 'monospace', fontSize: '0.9em' }}
                        />
                    </Form.Group>
                </SubDialog>
            )}

            {showAiModal && (
                <SubDialog
                    title="Wygeneruj plugin z AI"
                    onClose={() => setShowAiModal(false)}
                    footer={(
                        <>
                            <Button variant="secondary" onClick={() => setShowAiModal(false)}>Zamknij</Button>
                            <Button
                                variant="success"
                                onClick={() => {
                                    setShowAiModal(false);
                                    setShowCodeModal(true);
                                }}
                            >
                                Mam kod, wklej go
                            </Button>
                        </>
                    )}
                >
                    <p className="text-muted">
                        Opisz czego ma dokonywać plugin, skopiuj wygenerowany prompt i wklej go do wybranego czatu AI
                        (np. Claude, ChatGPT). AI zwróci kod w bloku kodu — użyj przycisku kopiowania przy tym bloku,
                        a następnie wklej go w oknie "Wklej kod".
                    </p>
                    <Form.Group className="mb-3">
                        <Form.Label>Co ma robić ten plugin?</Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={4}
                            value={aiDescription}
                            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setAiDescription(e.target.value)}
                            placeholder="Np. podswietl na czerwono linie zawierajace moje imie"
                            autoComplete="off"
                        />
                    </Form.Group>
                    <div className="d-flex flex-wrap gap-2">
                        <Button variant="primary" onClick={handleAiCopy}>Kopiuj prompt</Button>
                        <Button variant="outline-secondary" href="https://claude.ai/new" target="_blank" rel="noopener">
                            Otwórz Claude
                        </Button>
                        <Button variant="outline-secondary" href="https://chatgpt.com/" target="_blank" rel="noopener">
                            Otwórz ChatGPT
                        </Button>
                    </div>
                    {aiCopied && <div className="mt-2 text-success">Skopiowano do schowka!</div>}
                </SubDialog>
            )}
        </div>
    );
}

export default Scripts;
