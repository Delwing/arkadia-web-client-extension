import { findInOutput } from '@web/outputSearch/outputSearch';

/** A stock output line: timestamp + type columns, then the game text in coloured spans. */
function line(...parts: string[]): string {
    const spans = parts.map(p => `<span style="color: red">${p}</span>`).join('');
    return `<div class="output_msg"><div class="output_msg_text">` +
        `<span class="output-timestamp">12:00:00.000</span>` +
        `<span class="output-message-type">text</span>` +
        `<span class="output_msg_content">${spans}</span></div></div>`;
}

function output(html: string): { wrapper: HTMLElement; split: HTMLElement } {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html + '<div id="split-bottom"><div id="sticky-area">' + line('goblin w lustrze') + '</div></div>';
    document.body.replaceChildren(wrapper);
    return { wrapper, split: wrapper.querySelector('#split-bottom')! };
}

describe('findInOutput', () => {
    it('finds every hit top to bottom, ignoring case and Polish letters', () => {
        const { wrapper, split } = output(line('Widzisz Goblina.') + line('Nic.') + line('goblin i gobliń'));
        const hits = findInOutput(wrapper, 'goblin', new Set([split]));

        expect(hits.map(h => h.range.toString())).toEqual(['Goblin', 'goblin', 'gobliń']);
        expect(hits[0].line).toBe(wrapper.children[0]);
        expect(hits[1].line).toBe(wrapper.children[2]);
        expect(hits.map(h => h.start)).toEqual([8, 0, 9]);
    });

    it('matches across the coloured spans of one line', () => {
        const { wrapper, split } = output(line('Zielony go', 'bl', 'in stoi tu.'));
        const hits = findInOutput(wrapper, 'goblin stoi', new Set([split]));

        expect(hits).toHaveLength(1);
        expect(hits[0].range.toString()).toBe('goblin stoi');
    });

    it('skips the timestamp and message-type columns and the skipped nodes', () => {
        const { wrapper, split } = output(line('tekst'));
        expect(findInOutput(wrapper, '12:00', new Set([split]))).toEqual([]);
        expect(findInOutput(wrapper, 'lustrze', new Set([split]))).toEqual([]);
    });

    it('finds nothing for a blank query', () => {
        const { wrapper, split } = output(line('tekst'));
        expect(findInOutput(wrapper, '   ', new Set([split]))).toEqual([]);
    });
});
