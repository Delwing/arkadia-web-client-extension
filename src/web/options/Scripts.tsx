import { useCallback, useState, type ChangeEvent } from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import { Plus, Search, Store, X } from "lucide-react";
import { generatePluginId, storePluginScript } from "@client/utils/pluginStorage";
import { createEditorPluginFromSource, storeEditorPlugin } from "@client/utils/pluginEditorStorage";
import { editorUrl } from "../appUrls";
import { useInstalledPlugins } from "./useInstalledPlugins";
import { usePluginZipImport } from "./usePluginZipImport";
import ScriptsInstalled from "./ScriptsInstalled";
import ScriptsMarketplace from "./ScriptsMarketplace";
import {
    AddPluginDialog,
    AddUrlDialog,
    AiPromptDialog,
    PasteCodeDialog,
    type AddRoute,
} from "./ScriptsAddDialogs";

/**
 * "Skrypty" — the plugin manager.
 *
 * Two tabs over one search box: what is installed, and the public catalogue
 * (arkadia-plugin-marketplace) it can be installed from. Everything that used to
 * be a row of five buttons is behind one "Dodaj plugin" chooser, so the panel
 * opens on the list rather than on its own toolbar.
 *
 * A catalogue install is nothing more than the registry's pinned bundle URL
 * appended to the same `scripts` list a hand-typed URL goes into — see
 * `useInstalledPlugins` for why that, and not a new store, is the source of
 * truth for "which plugins came from the catalogue".
 *
 * The sub-dialogs use the shared inline `SubDialog` (see `@web/SubDialog` for
 * why a portaled react-bootstrap `<Modal>` cannot be used inside these panels).
 */
type Tab = "installed" | "catalog";

function Scripts() {
    const {
        plugins,
        installedSlugs,
        catalogError,
        addUrl,
        installFromRegistry,
        updateFromRegistry,
        remove,
        reloadStored,
    } = useInstalledPlugins();

    const [tab, setTab] = useState<Tab>("installed");
    const [search, setSearch] = useState("");
    const [dialog, setDialog] = useState<AddRoute | "chooser" | null>(null);

    const zip = usePluginZipImport(reloadStored);

    const openCatalog = useCallback(() => {
        setDialog(null);
        setSearch("");
        setTab("catalog");
    }, []);

    const pickRoute = useCallback(
        (route: AddRoute) => {
            if (route === "catalog") {
                openCatalog();
                return;
            }
            if (route === "editor") {
                setDialog(null);
                window.open(editorUrl(), "_blank");
                return;
            }
            if (route === "zip") {
                setDialog(null);
                zip.pick();
                return;
            }
            setDialog(route);
        },
        [openCatalog, zip]
    );

    const addPastedCode = useCallback(
        async (name: string, code: string) => {
            const source = code.trim();
            if (!source) return;

            const id = generatePluginId(name.trim() || source);
            const metadata = {
                name: name.trim() || "Wklejony plugin",
                version: "1.0.0",
                author: "Wklejony kod",
                description: 'Dodany przez "Wklej kod"',
            };

            try {
                await storePluginScript(id, source, metadata);
                // Mirror it into the editor's own database as well, or the plugin
                // cannot be opened for editing ("Plugin not found").
                await storeEditorPlugin(createEditorPluginFromSource(id, metadata.name, source, metadata));
                await reloadStored();
                setDialog(null);
            } catch (error) {
                console.error("Failed to store plugin:", error);
            }
        },
        [reloadStored]
    );

    const installed = plugins.length;
    const updates = plugins.filter((plugin) => plugin.updateVersion).length;

    return (
        <div className="plugin-manager">
            <input
                ref={zip.inputRef}
                type="file"
                accept=".zip"
                onChange={zip.handleFile}
                style={{ display: "none" }}
            />

            <div className="plugin-manager__tabs">
                <button
                    type="button"
                    className={`plugin-tab${tab === "installed" ? " plugin-tab--active" : ""}`}
                    onClick={() => setTab("installed")}
                >
                    Zainstalowane
                    {installed > 0 && <span className="plugin-tab__count">{installed}</span>}
                    {updates > 0 && <span className="plugin-tab__dot" title={`${updates} aktualizacji`} />}
                </button>
                <button
                    type="button"
                    className={`plugin-tab${tab === "catalog" ? " plugin-tab--active" : ""}`}
                    onClick={() => setTab("catalog")}
                >
                    <Store size={14} />
                    Katalog
                </button>
            </div>

            <div className="plugin-manager__toolbar">
                <div className="plugin-search">
                    <Search size={15} className="plugin-search__icon" />
                    <Form.Control
                        type="search"
                        size="sm"
                        value={search}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
                        placeholder={tab === "installed" ? "Szukaj wsrod zainstalowanych" : "Szukaj w katalogu"}
                    />
                    {search && (
                        <button
                            type="button"
                            className="plugin-search__clear"
                            onClick={() => setSearch("")}
                            title="Wyczysc"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
                <Button size="sm" variant="primary" className="plugin-add" onClick={() => setDialog("chooser")}>
                    <Plus size={15} />
                    Dodaj plugin
                </Button>
            </div>

            {zip.status && (
                <div
                    className={`plugin-banner plugin-banner--${
                        zip.status.type === "error" ? "error" : zip.status.type === "loading" ? "muted" : "success"
                    }`}
                >
                    {zip.status.type === "loading" && <Spinner animation="border" size="sm" />}
                    <span>{zip.status.message}</span>
                </div>
            )}

            <div className="plugin-manager__body">
                {tab === "installed" ? (
                    <ScriptsInstalled
                        plugins={plugins}
                        search={search}
                        catalogError={catalogError}
                        onUpdate={updateFromRegistry}
                        onRemove={remove}
                        onBrowseCatalog={openCatalog}
                    />
                ) : (
                    <ScriptsMarketplace
                        search={search}
                        installedSlugs={installedSlugs}
                        onInstall={installFromRegistry}
                    />
                )}
            </div>

            {dialog === "chooser" && <AddPluginDialog onPick={pickRoute} onClose={() => setDialog(null)} />}
            {dialog === "url" && (
                <AddUrlDialog
                    onAdd={addUrl}
                    onClose={() => setDialog(null)}
                />
            )}
            {dialog === "code" && (
                <PasteCodeDialog onSubmit={addPastedCode} onClose={() => setDialog(null)} />
            )}
            {dialog === "ai" && (
                <AiPromptDialog onHaveCode={() => setDialog("code")} onClose={() => setDialog(null)} />
            )}
        </div>
    );
}

export default Scripts;
