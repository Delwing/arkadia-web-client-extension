import { useCallback, useRef, useState, type ChangeEvent } from "react";
import { storePluginScript } from "@client/utils/pluginStorage";
import { storeEditorPlugin, type EditorPluginData } from "@client/utils/pluginEditorStorage";
import type { PluginImportWorkerResponse } from "../pluginImport.shared";
import PluginImportWorker from "../pluginImport.worker?worker";

export interface ImportStatus {
    message: string;
    type: "success" | "error" | "loading";
}

/**
 * "Importuj ZIP": unpacks and compiles a plugin package off the main thread
 * (esbuild-wasm lives in the worker), then writes both records the client needs
 * — the editor's source bundle and the compiled runtime script.
 */
export function usePluginZipImport(onImported: () => Promise<void> | void) {
    const [status, setStatus] = useState<ImportStatus | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const flash = useCallback((next: ImportStatus, holdMs: number) => {
        setStatus(next);
        setTimeout(() => setStatus(null), holdMs);
    }, []);

    const handleFile = useCallback(
        async (event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (!file) return;
            // Reset so the same file can be picked again after a failure.
            event.target.value = "";

            setStatus({ message: "Importowanie...", type: "loading" });

            let buffer: ArrayBuffer;
            try {
                buffer = await file.arrayBuffer();
            } catch {
                flash({ message: "Nie udalo sie odczytac pliku.", type: "error" }, 5000);
                return;
            }

            const worker = new PluginImportWorker();

            worker.onmessage = async (message: MessageEvent<PluginImportWorkerResponse>) => {
                const response = message.data;

                if (response.type === "progress") {
                    setStatus({ message: response.message, type: "loading" });
                    return;
                }

                worker.terminate();

                if (response.type === "error") {
                    flash({ message: response.message, type: "error" }, 5000);
                    return;
                }

                try {
                    const { id, name, compiled, files, folders, entryPoint, metadata } = response.plugin;
                    const now = Date.now();

                    const editorPlugin: EditorPluginData = {
                        id,
                        name,
                        compiled,
                        files,
                        folders,
                        entryPoint,
                        metadata: {
                            name: metadata?.name ?? name,
                            version: metadata?.version || "1.0.0",
                            author: metadata?.author || "Imported",
                            description: metadata?.description || "Imported from ZIP",
                        },
                        createdAt: now,
                        updatedAt: now,
                        lastCompiledAt: now,
                    };

                    await storeEditorPlugin(editorPlugin);
                    await storePluginScript(id, compiled, editorPlugin.metadata);
                    await onImported();
                    // Tells other tabs (notably the editor) to re-read the list.
                    localStorage.setItem("stored_scripts_updated", String(Date.now()));

                    flash({ message: `Zaimportowano: ${name}`, type: "success" }, 3000);
                } catch (error) {
                    console.error("Failed to store plugin:", error);
                    flash({ message: "Blad podczas zapisywania pluginu.", type: "error" }, 5000);
                }
            };

            worker.onerror = (error) => {
                console.error("Worker error:", error);
                worker.terminate();
                flash({ message: "Blad podczas importu.", type: "error" }, 5000);
            };

            worker.postMessage({ type: "import", file: buffer });
        },
        [flash, onImported]
    );

    return { status, inputRef, handleFile, pick: () => inputRef.current?.click() };
}
