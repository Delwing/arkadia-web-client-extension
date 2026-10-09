// Strings (a key when a colon follows), literals and numbers in formatted JSON.
const TOKEN = /("(?:\\.|[^"\\\n])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Colours JSON text as HTML: every token is escaped and wrapped in a
 * `json-*` span (key, string, number, literal). A regex pass rather than a
 * grammar, so a large snapshot stays fast and cut-off text still renders.
 */
export function highlightJson(text: string): string {
  let html = '';
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index;
    html += escapeHtml(text.slice(last, start));
    const [token, str, colon, literal] = match;
    if (str !== undefined) {
      const kind = colon !== undefined ? 'key' : 'string';
      html += `<span class="json-${kind}">${escapeHtml(str)}</span>`;
      if (colon !== undefined) html += colon;
    } else if (literal !== undefined) {
      html += `<span class="json-literal">${literal}</span>`;
    } else {
      html += `<span class="json-number">${token}</span>`;
    }
    last = start + token.length;
  }
  return html + escapeHtml(text.slice(last));
}
