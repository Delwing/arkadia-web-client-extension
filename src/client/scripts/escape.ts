import Client from "../Client";
import {colorString, createColorFormat} from "@modules/core/Colors";

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
        printArrow(dir, COLOR);
        return line.color([0, line.length], COLOR);
    });

    parent.registerChild(/(.*) w panice .* na ([a-z-]+)\.$/, (line, matches) => {
        const dir = matches[2];
        printArrow(dir, PANIC_COLOR);
        return line.color([0, line.length], PANIC_COLOR);
    });

    client.Triggers.registerTrigger(
        /^Udalo ci sie gdzies uciec!$/,
        (line) => {
            return line.color([0, line.length], SUCCESS_COLOR).prefix('--- ', PREFIX_COLOR);
        },
        tag
    );

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

