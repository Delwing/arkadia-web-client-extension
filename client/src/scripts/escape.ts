import Client from "../Client";
import {colorString, findClosestColor} from "../Colors";
import { stripAnsiCodes } from "../Triggers";

const COLOR = findClosestColor('#6a5acd');
const PANIC_COLOR = findClosestColor('#ff8c00');

export default function initEscape(client: Client) {
    const tag = 'escape';
    const parent = client.Triggers.registerTrigger(
        /(.*) uciekl.* ci\.$/,
        (raw) => {
            const line = stripAnsiCodes(raw).replace(/\s$/g, "");
            return colorString(line, COLOR);
        },
        tag,
        {stayOpenLines: 20}
    );

    parent.registerChild(/(.*) podaza(?:ja)? na ([a-z-]+)\.$/, (raw, _line, m) => {
        const line = stripAnsiCodes(raw).replace(/\s$/g, "");
        const dir = m[2];
        printArrow(dir, COLOR);
        return colorString(line, COLOR);
    });

    parent.registerChild(/(.*) w panice .* na ([a-z-]+)\.$/, (raw, _line, m) => {
        const line = stripAnsiCodes(raw).replace(/\s$/g, "");
        const dir = m[2];
        printArrow(dir, PANIC_COLOR);
        return colorString(line, PANIC_COLOR);
    });

    function printArrow(dir, color) {
        if (dir === "poludnie") {
            client.print(colorString(`\n`, color));
            client.print(colorString(`                  #`, color));
            client.print(colorString(`                  #`, color));
            client.print(colorString(`                # # #`, color));
            client.print(colorString(`                 ###`, color));
            client.print(colorString(`                  #`, color));
        } else if (dir === "polnoc") {
            client.print(colorString(`\n`, color));
            client.print(colorString(`                  #`, color));
            client.print(colorString(`                 ###`, color));
            client.print(colorString(`                # # #`, color));
            client.print(colorString(`                  #`, color));
            client.print(colorString(`                  #`, color));
        } else if (dir === "wschod") {
            client.print(colorString(`\n`, color));
            client.print(colorString(`                  #`, color));
            client.print(colorString(`                   #`, color));
            client.print(colorString(`              #######`, color));
            client.print(colorString(`                   #`, color));
            client.print(colorString(`                  #`, color));
        } else if (dir === "zachod") {
            client.print(colorString(`\n`, color));
            client.print(colorString(`                #`, color));
            client.print(colorString(`               #`, color));
            client.print(colorString(`              #######`, color));
            client.print(colorString(`               #`, color));
            client.print(colorString(`                #`, color));
        } else if (dir === "poludniowy-wschod") {
            client.print(colorString(`\n`, color));
            client.print(colorString(`               #`, color));
            client.print(colorString(`                 #`, color));
            client.print(colorString(`                   #   #`, color));
            client.print(colorString(`                     # #`, color));
            client.print(colorString(`                   # # #`, color));
        } else if (dir === "poludniowy-zachod") {
            client.print(colorString(`\n`, color));
            client.print(colorString(`                       #`, color));
            client.print(colorString(`                     #`, color));
            client.print(colorString(`               #   #`, color));
            client.print(colorString(`               # #`, color));
            client.print(colorString(`               # # #`, color));
        } else if (dir === "polnocny-wschod") {
            client.print(colorString(`\n`, color));
            client.print(colorString(`                   # # #`, color));
            client.print(colorString(`                     # #`, color));
            client.print(colorString(`                   #   #`, color));
            client.print(colorString(`                 #`, color));
            client.print(colorString(`               #`, color));
        } else if (dir === "polnocny-zachod") {
            client.print(colorString(`\n`, color));
            client.print(colorString(`               # # #`, color));
            client.print(colorString(`               # #`, color));
            client.print(colorString(`               #   #`, color));
            client.print(colorString(`                     #`, color));
            client.print(colorString(`                       #`, color));
        } else if (dir === "dol") {
            client.print(colorString(`\n`, color));
            client.print(colorString(`            ###`, color));
            client.print(colorString(`            #  #`, color));
            client.print(colorString(`            #  #`, color));
            client.print(colorString(`            #  #`, color));
            client.print(colorString(`            ###`, color));
        } else if (dir === "gore") {
            client.print(colorString(`\n`, color));
            client.print(colorString(`            #  #`, color));
            client.print(colorString(`            #  #`, color));
            client.print(colorString(`            #  #`, color));
            client.print(colorString(`            #  #`, color));
            client.print(colorString(`             ## `, color));
        }
        client.print(`\n`);
    }
}

