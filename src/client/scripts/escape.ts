import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";
import {printArrow} from "./lib/printArrow";

const COLOR = createColorFormat('#6a5acd');
const PANIC_COLOR = createColorFormat('#ff8c00');
const SUCCESS_COLOR = createColorFormat('#ff0000');
const PREFIX_COLOR = createColorFormat('#ffa500');

export default function initEscape(client: Client) {
    const tag = 'escape';
    const parent = client.Triggers.registerTrigger(
        /(.*) uciekl.* ci\.$/,
        (line) => {
            return line.color([0, line.length], COLOR)
        },
        tag,
        {stayOpenLines: 20}
    );

    parent.registerChild(/(.*) podaza(?:ja)? na ([a-z-]+)\.$/, (line, matches) => {
        const dir = matches[2];
        printArrow(client, dir, COLOR);
        return line.color([0, line.length], COLOR);
    });

    parent.registerChild(/(.*) w panice .* na ([a-z-]+)\.$/, (line, matches) => {
        const dir = matches[2];
        printArrow(client, dir, PANIC_COLOR);
        return line.color([0, line.length], PANIC_COLOR);
    });

    client.Triggers.registerTrigger(
        /^Udalo ci sie gdzies uciec!$/,
        (line) => {
            return line.color([0, line.length], SUCCESS_COLOR).prefix('--- ', PREFIX_COLOR);
        },
        tag
    );
}

