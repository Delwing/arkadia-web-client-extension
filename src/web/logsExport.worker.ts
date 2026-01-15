import JSZip from 'jszip';
import type {
    LogEntry,
    LogsExportWorkerRequest,
    LogsExportWorkerResponse,
} from './logsExport.shared';

function formatDateTime(ts: number): string {
    const d = new Date(ts);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${y}-${mo}-${da} ${h}:${m}:${s}.${ms}`;
}

function formatSessionLabel(name: string): string {
    if (name.startsWith('session_')) {
        const ts = parseInt(name.slice('session_'.length), 10);
        if (!Number.isNaN(ts)) {
            return new Date(ts).toLocaleString();
        }
    }
    return name;
}

function splitLines(html: string): string[] {
    const lines: string[] = [];
    const stack: { open: string; close: string }[] = [];
    let line = '';
    const regex = /(<[^>]+>|\r?\n)/g;
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
        const token = match[0];
        line += html.slice(last, match.index);
        if (token === '\n' || token === '\r\n') {
            lines.push(line + stack.map(s => s.close).reverse().join(''));
            line = stack.map(s => s.open).join('');
        } else {
            line += token;
            if (token.startsWith('<') && !token.startsWith('</') && !token.endsWith('/>') && !token.startsWith('<!')) {
                const tag = token.match(/^<([a-zA-Z0-9:-]+)/);
                if (tag) stack.push({ open: token, close: `</${tag[1]}>` });
            } else if (token.startsWith('</')) {
                stack.pop();
            }
        }
        last = regex.lastIndex;
    }
    line += html.slice(last);
    lines.push(line);
    return lines;
}

async function openDb(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
        try {
            const request = indexedDB.open('ArkadiaMessagesDB');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => {
                console.error('[LogsExport] Failed to open IndexedDB:', request.error);
                resolve(null);
            };
        } catch (error) {
            console.error('[LogsExport] Error opening IndexedDB:', error);
            resolve(null);
        }
    });
}

async function getSessionData(db: IDBDatabase, storeName: string): Promise<LogEntry[]> {
    return new Promise(resolve => {
        let tx: IDBTransaction;
        try {
            tx = db.transaction(storeName, 'readonly');
        } catch (error) {
            console.error(`Failed to create transaction for ${storeName}:`, error);
            resolve([]);
            return;
        }
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result as LogEntry[]);
        req.onerror = () => {
            console.error(`Failed to read from ${storeName}:`, req.error);
            resolve([]);
        };
    });
}

function generateHtml(logs: LogEntry[], sessionName: string, inlineStyles: string): string {
    const entries: string[] = [];
    for (const l of logs) {
        const time = formatDateTime(l.timestamp);
        const parts = splitLines(l.text);
        for (const part of parts) {
            const classes = ['output_msg'];
            if (l.type) classes.push(l.type);
            const lineHtml = `<div class="${classes.join(' ')}"><div class="output_msg_text" style="white-space:pre-wrap"><span class="log-time">${time}</span><span>${part}</span></div></div>`;
            entries.push(lineHtml);
        }
    }

    const head = `<meta charset="UTF-8">\n<title>${sessionName} - ${formatSessionLabel(sessionName)}</title>\n<style>${inlineStyles}\nhtml, body { overflow: auto; } #logs-preview { height: auto; }</style>`;
    return `<!doctype html><html lang="en"><head>${head}</head><body><div id="logs-preview">${entries.join('\n')}</div></body></html>`;
}

async function getSessionsWithContent(db: IDBDatabase): Promise<string[]> {
    const available: string[] = [];
    for (let i = 0; i < db.objectStoreNames.length; i++) {
        const name = db.objectStoreNames.item(i);
        if (!name) continue;
        try {
            const tx = db.transaction(name, 'readonly');
            const req = tx.objectStore(name).count();
            const count = await new Promise<number>(resolve => {
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(0);
            });
            if (count > 0) {
                available.push(name);
            }
        } catch (error) {
            console.error(`Error accessing session ${name}:`, error);
        }
    }
    available.sort((a, b) => a.localeCompare(b));
    return available;
}

const ctx = self as unknown as {
    postMessage: (message: LogsExportWorkerResponse) => void;
    addEventListener: typeof addEventListener;
};

ctx.addEventListener('message', (event: MessageEvent<LogsExportWorkerRequest>) => {
    const { data } = event;
    if (!data || data.type !== 'export') {
        return;
    }

    (async () => {
        try {
            const db = await openDb();
            if (!db) {
                ctx.postMessage({
                    type: 'error',
                    message: 'Nie udalo sie otworzyc bazy danych.',
                });
                return;
            }

            const sessions = await getSessionsWithContent(db);
            if (sessions.length === 0) {
                ctx.postMessage({
                    type: 'error',
                    message: 'Brak logow do eksportu.',
                });
                return;
            }

            const zip = new JSZip();
            const total = sessions.length;

            for (let i = 0; i < sessions.length; i++) {
                const sessionName = sessions[i];
                ctx.postMessage({
                    type: 'progress',
                    current: i + 1,
                    total,
                    sessionName: formatSessionLabel(sessionName),
                });

                const logs = await getSessionData(db, sessionName);
                if (logs.length === 0) continue;

                const html = generateHtml(logs, sessionName, data.inlineStyles);
                zip.file(`${sessionName}.html`, html);
            }

            const blob = await zip.generateAsync({ type: 'blob' });

            ctx.postMessage({
                type: 'success',
                blob,
                sessionCount: sessions.length,
            });
        } catch (error) {
            ctx.postMessage({
                type: 'error',
                message: error instanceof Error ? error.message : 'Nie udalo sie wyeksportowac logow.',
            });
        }
    })();
});
