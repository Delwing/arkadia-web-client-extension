/**
 * Agent Diagnostics
 * Collects TypeScript/JavaScript compilation and type errors for a plugin using
 * Monaco's language worker - the same diagnostics shown as squiggles in the editor.
 *
 * Note: the editor's esbuild-based `compileTypeScript` only transpiles and cannot
 * report type errors, so we go through the Monaco TS worker instead.
 */

import * as monaco from 'monaco-editor';

/** Diagnostic categories from the TS worker: 0=warning, 1=error, 2=suggestion, 3=message */
const CATEGORY_WARNING = 0;
const CATEGORY_ERROR = 1;

interface DiagnosticMessageChain {
  messageText: string;
  next?: DiagnosticMessageChain[];
}

/** Flatten a (possibly nested) diagnostic message chain into a single line. */
function flattenMessage(messageText: string | DiagnosticMessageChain): string {
  if (typeof messageText === 'string') return messageText;
  let result = messageText.messageText;
  if (messageText.next) {
    for (const next of messageText.next) {
      result += ' ' + flattenMessage(next);
    }
  }
  return result;
}

function relativePath(uriStr: string, prefix: string): string {
  return uriStr.startsWith(prefix) ? uriStr.slice(prefix.length) : uriStr;
}

/**
 * Returns a human/AI-readable report of compilation errors and warnings for all
 * TypeScript/JavaScript files in the given plugin, formatted like `tsc` output:
 *   index.ts(12,5): error TS2304: Cannot find name 'foo'.
 */
export async function getPluginCompilationErrors(pluginId: string): Promise<string> {
  const prefix = `file:///${pluginId}/`;

  const models = monaco.editor.getModels().filter((m) => {
    const uri = m.uri.toString();
    if (!uri.startsWith(prefix)) return false;
    const lang = m.getLanguageId();
    return lang === 'typescript' || lang === 'javascript';
  });

  if (models.length === 0) {
    return 'No TypeScript/JavaScript files to check.';
  }

  let getTsWorker: ((...uris: monaco.Uri[]) => Promise<any>) | null = null;
  let getJsWorker: ((...uris: monaco.Uri[]) => Promise<any>) | null = null;
  try {
    getTsWorker = await monaco.typescript.getTypeScriptWorker();
    getJsWorker = await monaco.typescript.getJavaScriptWorker();
  } catch (e) {
    return `Could not start the TypeScript checker: ${e instanceof Error ? e.message : 'unknown error'}`;
  }

  const lines: string[] = [];
  let errorCount = 0;
  let warningCount = 0;

  for (const model of models) {
    const uriStr = model.uri.toString();
    const path = relativePath(uriStr, prefix);
    const getWorker = model.getLanguageId() === 'javascript' ? getJsWorker : getTsWorker;
    if (!getWorker) continue;

    let diagnostics: any[];
    try {
      const worker = await getWorker(model.uri);
      const [syntactic, semantic] = await Promise.all([
        worker.getSyntacticDiagnostics(uriStr),
        worker.getSemanticDiagnostics(uriStr),
      ]);
      diagnostics = [...syntactic, ...semantic];
    } catch (e) {
      lines.push(`${path}: failed to check (${e instanceof Error ? e.message : 'unknown error'})`);
      continue;
    }

    for (const d of diagnostics) {
      // Only report errors and warnings; skip suggestions/messages to reduce noise.
      if (d.category !== CATEGORY_ERROR && d.category !== CATEGORY_WARNING) continue;

      const severity = d.category === CATEGORY_ERROR ? 'error' : 'warning';
      if (d.category === CATEGORY_ERROR) errorCount++;
      else warningCount++;

      let location = '';
      if (typeof d.start === 'number') {
        const pos = model.getPositionAt(d.start);
        location = `(${pos.lineNumber},${pos.column})`;
      }

      lines.push(`${path}${location}: ${severity} TS${d.code}: ${flattenMessage(d.messageText)}`);
    }
  }

  if (lines.length === 0) {
    return 'No compilation errors. All files type-check cleanly.';
  }

  const summary = `${errorCount} error(s)` + (warningCount > 0 ? `, ${warningCount} warning(s)` : '');
  return `${summary}:\n${lines.join('\n')}`;
}
