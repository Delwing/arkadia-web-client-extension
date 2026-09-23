/**
 * What each automation script did on its recent runs: who started it, what it
 * sent or printed, what it logged, and the error that stopped it. The client
 * writes; the script editor's console reads.
 */
export type ScriptLogKind = "run" | "send" | "print" | "log" | "error";

export interface ScriptLogEntry {
    at: number;
    kind: ScriptLogKind;
    text: string;
}

const LIMIT = 200;
const logs = new Map<string, ScriptLogEntry[]>();
const listeners = new Set<(scriptId: string) => void>();

export function appendScriptLog(scriptId: string, kind: ScriptLogKind, text: string): void {
    const list = logs.get(scriptId) ?? [];
    list.push({ at: Date.now(), kind, text });
    if (list.length > LIMIT) list.splice(0, list.length - LIMIT);
    logs.set(scriptId, list);
    listeners.forEach(l => l(scriptId));
}

export function getScriptLog(scriptId: string): ScriptLogEntry[] {
    return logs.get(scriptId)?.slice() ?? [];
}

export function clearScriptLog(scriptId: string): void {
    logs.delete(scriptId);
    listeners.forEach(l => l(scriptId));
}

export function onScriptLog(listener: (scriptId: string) => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
