import Client from "../Client";
import {colorString, findClosestColor} from "@modules/core/Colors";
import TriggerLine from "../triggers/TriggerLine";

const COLOR = findClosestColor('#6a5acd');
const PANIC_COLOR = findClosestColor('#ff8c00');
const SUCCESS_COLOR = findClosestColor('#ff0000');
const PREFIX_COLOR = findClosestColor('#ffa500');

export default function initEscape(client: Client) {
    const tag = 'escape';
    const parent = client.Triggers.registerTrigger(
        /(.*) uciekl.* ci\.$/,
        (triggerLine) => {
            const line = triggerLine.text;
            return new TriggerLine(colorString(line, COLOR));
        },
        tag,
        {stayOpenLines: 20}
    );

    parent.registerChild(/(.*) podaza(?:ja)? na ([a-z-]+)\.$/, (triggerLine) => {
        const line = triggerLine.text;
        const m = triggerLine.matches.matches;
        if (!m) return triggerLine;
        const dir = m[2];
        printArrow(dir, COLOR);
        return new TriggerLine(colorString(line, COLOR));
    });

    parent.registerChild(/(.*) w panice .* na ([a-z-]+)\.$/, (triggerLine) => {
        const line = triggerLine.text;
        const m = triggerLine.matches.matches;
        if (!m) return triggerLine;
        const dir = m[2];
        printArrow(dir, PANIC_COLOR);
        return new TriggerLine(colorString(line, PANIC_COLOR));
    });

    client.Triggers.registerTrigger(
        /^Udalo ci sie gdzies uciec!$/,
        (triggerLine) => {
            const line = triggerLine.text;
            const result = client.prefix(
                colorString(line, SUCCESS_COLOR),
                colorString('--- ', PREFIX_COLOR)
            );
            return new TriggerLine(result);
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

