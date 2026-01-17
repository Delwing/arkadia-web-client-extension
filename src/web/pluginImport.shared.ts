export interface PluginFile {
    path: string;
    content: string;
    language: 'javascript' | 'typescript' | 'json' | 'plaintext';
}

export interface PluginMetadata {
    name: string;
    version?: string;
    author?: string;
    description?: string;
}

export interface PluginImportWorkerRequest {
    type: 'import';
    file: ArrayBuffer;
}

export interface PluginImportResult {
    id: string;
    name: string;
    compiled: string;
    files: Record<string, PluginFile>;
    folders: string[];
    entryPoint: string;
    metadata?: PluginMetadata;
}

export type PluginImportWorkerResponse =
    | { type: 'progress'; message: string }
    | { type: 'success'; plugin: PluginImportResult }
    | { type: 'error'; message: string };
