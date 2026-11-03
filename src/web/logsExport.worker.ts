import JSZip from 'jszip';
import type {
    ExportFormat,
    LogEntry,
    LogExportData,
    LogsExportWorkerRequest,
    LogsExportWorkerResponse,
} from './logsExport.shared';
import { htmlToText } from '../../views/log-viewer/htmlToText';
import { countSessions, openLogsDb, readSession } from './logsDatabase';

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

function generateHtml(logs: LogEntry[], sessionName: string, inlineStyles: string): string {
    const entries: string[] = [];
    for (const l of logs) {
        const time = formatDateTime(l.timestamp);
        const parts = splitLines(l.text);
        for (const part of parts) {
            const classes = ['output_msg'];
            if (l.type) classes.push(l.type);
            const lineHtml = `<div class="${classes.join(' ')}"><div class="output_msg_text"><span class="log-time">${time}</span><span>${part}</span></div></div>`;
            entries.push(lineHtml);
        }
    }

    const head = `<meta charset="UTF-8">\n<title>${sessionName} - ${formatSessionLabel(sessionName)}</title>\n<style>${inlineStyles}\nhtml, body { overflow: auto; } #logs-preview { height: auto; }</style>`;
    return `<!doctype html><html lang="en"><head>${head}</head><body><div id="logs-preview">${entries.join('\n')}</div></body></html>`;
}

/** Plain text: a timestamp and the line's text, per line, as "Pobierz jako tekst" gives it. */
function generateText(logs: LogEntry[]): string {
    const lines: string[] = [];
    for (const l of logs) {
        const time = formatDateTime(l.timestamp);
        const text = typeof l.text === 'string' ? l.text : String(l.text ?? '');
        for (const part of splitLines(text)) lines.push(`${time} ${htmlToText(part)}`);
    }
    return lines.join('\n') + '\n';
}

/** One log in the importable shape: one file per log, so no single string has to hold them all. */
function generateJson(logs: LogEntry[], sessionName: string): string {
    const data: LogExportData = { version: 1, sessions: { [sessionName]: logs } };
    return JSON.stringify(data);
}

/** Where a log's file goes: at the top with one format, in a folder per format with several. */
function filePath(format: ExportFormat, sessionName: string, formats: ExportFormat[]): string {
    const file = `${sessionName}.${format}`;
    return formats.length > 1 ? `${format}/${file}` : file;
}

/** Sessions holding at least one record, oldest first. */
async function getSessionsWithContent(db: IDBDatabase): Promise<string[]> {
    const counts = await countSessions(db);
    return [...counts.keys()].filter(name => (counts.get(name) ?? 0) > 0).sort((a, b) => a.localeCompare(b));
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
            const db = await openLogsDb();
            if (!db) {
                ctx.postMessage({
                    type: 'error',
                    message: 'Nie udało się otworzyć bazy danych.',
                });
                return;
            }

            const sessions = data.sessionNames ?? await getSessionsWithContent(db);
            if (sessions.length === 0) {
                ctx.postMessage({
                    type: 'error',
                    message: 'Brak logów do eksportu.',
                });
                return;
            }

            const formats: ExportFormat[] = data.formats && data.formats.length > 0 ? data.formats : ['html'];
            const zip = new JSZip();
            const total = sessions.length;
            const exported: string[] = [];

            for (let i = 0; i < sessions.length; i++) {
                const sessionName = sessions[i];
                ctx.postMessage({
                    type: 'progress',
                    current: i + 1,
                    total,
                    sessionName: formatSessionLabel(sessionName),
                });

                const logs = await readSession(db, sessionName);
                if (logs.length === 0) continue;

                for (const format of formats) {
                    const content = format === 'html'
                        ? generateHtml(logs, sessionName, data.inlineStyles)
                        : format === 'txt'
                          ? generateText(logs)
                          : generateJson(logs, sessionName);
                    zip.file(filePath(format, sessionName, formats), content);
                }
                exported.push(sessionName);
            }

            const blob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 9 },
            });

            ctx.postMessage({
                type: 'success',
                blob,
                sessionCount: exported.length,
                exported,
            });
        } catch (error) {
            ctx.postMessage({
                type: 'error',
                message: error instanceof Error ? error.message : 'Nie udało się wyeksportować logów.',
            });
        }
    })();
});
