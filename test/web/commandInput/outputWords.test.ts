import {describe, expect, it} from "vitest";
import {harvestOutputLines, harvestOutputWords} from "../../../src/web/commandInput/outputWords";

function wrapperWith(html: string): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    return wrapper;
}

describe('harvestOutputWords', () => {
    it('ignores timestamp and message-type spans', () => {
        const wrapper = wrapperWith(
            '<div class="output_msg"><span class="output-timestamp">12:34:56</span>' +
            '<span class="output-message-type">room.short</span>' +
            '<span class="output_msg_content">Stoisz na <span>trakcie</span></span></div>'
        );
        expect(harvestOutputLines(wrapper)).toEqual(['Stoisz na trakcie']);
        expect(harvestOutputWords(wrapper)).toEqual(['Stoisz', 'na', 'trakcie']);
    });

    it('reads plain lines unchanged', () => {
        expect(harvestOutputWords(wrapperWith('<p>Widzisz goblina</p>'))).toEqual(['Widzisz', 'goblina']);
    });
});
