import { useEffect, useState, ChangeEvent } from "react";
import { Button, Form, Badge, Spinner } from "react-bootstrap";
import { TiDelete } from "react-icons/ti";
import storage from "@modules/core/storage";
import { getPluginManager } from "@client/main";
import type { LoadedPlugin } from "@shared/types/Plugin";
import { BUILTIN_PLUGIN_DEFINITIONS } from "@shared/constants/builtinPlugins";

function Scripts() {
    const [scripts, setScripts] = useState<string[]>([]);
    const [builtinScripts, setBuiltinScripts] = useState<string[]>([]);
    const [pluginInfo, setPluginInfo] = useState<Map<string, LoadedPlugin>>(new Map());
    const [input, setInput] = useState("");

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

        storage.getItem("builtinScripts").then(res => {
            if (res && Array.isArray(res.builtinScripts)) {
                const valid = res.builtinScripts.filter((id: unknown): id is string => (
                    typeof id === "string" && BUILTIN_PLUGIN_DEFINITIONS.some(def => def.id === id)
                ));
                setBuiltinScripts(valid);
            }
        });

        // Initial plugin info refresh
        refreshPluginInfo();

        // Listen for plugin events
        if (window.client) {
            const handlePluginLoaded = () => refreshPluginInfo();
            const handlePluginError = () => refreshPluginInfo();
            const handlePluginDestroyed = () => refreshPluginInfo();

            window.client.on('plugin:loaded', handlePluginLoaded);
            window.client.on('plugin:error', handlePluginError);
            window.client.on('plugin:destroyed', handlePluginDestroyed);

            return () => {
                window.client?.off('plugin:loaded', handlePluginLoaded);
                window.client?.off('plugin:error', handlePluginError);
                window.client?.off('plugin:destroyed', handlePluginDestroyed);
            };
        }
    }, []);

    function save(list: string[]) {
        setScripts(list);
        storage.setItem("scripts", list);
    }

    function saveBuiltin(list: string[]) {
        setBuiltinScripts(list);
        storage.setItem("builtinScripts", list);
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

    function remove(url: string) {
        const updated = scripts.filter(u => u !== url);
        save(updated);
    }

    function toggleBuiltin(id: string, enabled: boolean) {
        if (enabled) {
            if (!builtinScripts.includes(id)) {
                const updated = [...builtinScripts, id];
                saveBuiltin(updated);
            }
        } else {
            if (builtinScripts.includes(id)) {
                const updated = builtinScripts.filter(item => item !== id);
                saveBuiltin(updated);
            }
        }
    }

    return (
        <div className="m-2 d-flex flex-column gap-2">
            <section>
                <h6 className="text-uppercase text-muted small mb-2">Wbudowane pluginy</h6>
                <ul className="list-unstyled ms-3">
                    {BUILTIN_PLUGIN_DEFINITIONS.map(def => {
                        const plugin = pluginInfo.get(def.id);
                        const enabled = builtinScripts.includes(def.id);
                        const isLoading = plugin?.status === 'loading';
                        const hasError = plugin?.status === 'error';
                        const info = plugin?.info;

                        return (
                            <li key={def.id} className="d-flex flex-column gap-1 mb-3">
                                <div className="d-flex align-items-start gap-2">
                                    <Form.Check
                                        type="switch"
                                        id={`builtin-${def.id}`}
                                        checked={enabled}
                                        onChange={event => toggleBuiltin(def.id, event.target.checked)}
                                        label={(
                                            <div className="d-flex flex-column">
                                            <div className="d-flex align-items-center gap-2">
                                                <strong>{info?.name ?? def.name}</strong>
                                                {(info?.version) && (
                                                    <Badge bg="primary" pill>v{info.version}</Badge>
                                                )}
                                                {info?.author && (
                                                    <small className="text-muted">by {info.author}</small>
                                                )}
                                            </div>
                                                {(info?.description ?? def.description) && (
                                                    <small className="text-muted">
                                                        {info?.description ?? def.description}
                                                    </small>
                                                )}
                                            </div>
                                        )}
                                    />
                                    {isLoading && <Spinner animation="border" size="sm" />}
                                </div>
                                {hasError && (
                                    <small className="text-danger">
                                        {plugin?.error}
                                    </small>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </section>
            <Form.Group className="d-flex align-items-center gap-2">
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
                    style={{width: '100%', maxWidth: '16rem'}}
                />
                <Button size="sm" onClick={add}>Dodaj</Button>
            </Form.Group>
            <ul className="list-unstyled ms-3">
                {scripts.map(url => {
                    const plugin = pluginInfo.get(url);
                    const hasPluginInfo = plugin?.info;
                    const isLoading = plugin?.status === 'loading';
                    const hasError = plugin?.status === 'error';
                    const isLegacy = plugin?.status === 'legacy';

                    return (
                        <li key={url} className="d-flex flex-column gap-1 mb-3">
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
                                        </div>
                                        {plugin.info!.description && (
                                            <small className="text-muted">{plugin.info!.description}</small>
                                        )}
                                        <small className="text-muted font-monospace">{url}</small>
                                    </div>
                                ) : (
                                    <div className="d-flex flex-column">
                                        <span className="font-monospace">{url}</span>
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
                                    onClick={() => remove(url)}
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
