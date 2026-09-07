import { describe, expect, it } from 'vitest';
import { renderPluginReadme } from '@web/options/pluginReadme';

describe('renderPluginReadme', () => {
    it('renders ordinary markdown', () => {
        const html = renderPluginReadme('# Tytul\n\nTekst z **pogrubieniem**.');
        expect(html).toContain('<h1>Tytul</h1>');
        expect(html).toContain('<strong>pogrubienie');
    });

    it('drops script tags and their contents', () => {
        const html = renderPluginReadme('Przed\n\n<script>window.stolen = 1</script>\n\nPo');
        expect(html).not.toContain('script');
        expect(html).not.toContain('stolen');
    });

    it('strips event handlers from allowed tags', () => {
        const html = renderPluginReadme('<p onclick="alert(1)">Klik</p>');
        expect(html).toContain('Klik');
        expect(html).not.toContain('onclick');
    });

    it('keeps http links but drops javascript ones', () => {
        const safe = renderPluginReadme('[repo](https://github.com/x/y)');
        expect(safe).toContain('href="https://github.com/x/y"');
        expect(safe).toContain('rel="noopener noreferrer"');

        const unsafe = renderPluginReadme('[klik](javascript:alert(1))');
        expect(unsafe).not.toContain('javascript:');
    });

    it('unwraps unknown elements but keeps their text', () => {
        const html = renderPluginReadme('<marquee>Uwaga</marquee>');
        expect(html).toContain('Uwaga');
        expect(html).not.toContain('marquee');
    });

    it('returns nothing for an empty readme', () => {
        expect(renderPluginReadme('   ')).toBe('');
    });
});
