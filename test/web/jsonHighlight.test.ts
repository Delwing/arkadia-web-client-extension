import { describe, expect, it } from 'vitest';
import { highlightJson } from '@web/jsonHighlight';

describe('highlightJson', () => {
  it('marks keys, strings, numbers and literals', () => {
    const html = highlightJson(JSON.stringify({ name: 'Ola', n: -1.5e3, ok: true, x: null }, null, 2));
    expect(html).toContain('<span class="json-key">"name"</span>:');
    expect(html).toContain('<span class="json-string">"Ola"</span>');
    expect(html).toContain('<span class="json-number">-1500</span>');
    expect(html).toContain('<span class="json-literal">true</span>');
    expect(html).toContain('<span class="json-literal">null</span>');
  });

  it('escapes markup inside strings', () => {
    const html = highlightJson(JSON.stringify({ a: '<b>&"' }));
    expect(html).toContain('<span class="json-string">"&lt;b&gt;&amp;\\""</span>');
    expect(html).not.toContain('<b>');
  });

  it('does not treat digits inside strings as numbers', () => {
    const html = highlightJson('"room 12"');
    expect(html).toBe('<span class="json-string">"room 12"</span>');
  });

  it('renders cut-off text without dropping it', () => {
    expect(highlightJson('{"a": "unterminated')).toContain('unterminated');
  });
});
