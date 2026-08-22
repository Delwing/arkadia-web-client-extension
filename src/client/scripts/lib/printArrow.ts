import Client from "../../Client";
import {colorString} from "@modules/core/Colors";
import {FormatStateSnapshot} from "@client/ansi/FormatState";

export function printArrow(client: Client, dir: string, color: FormatStateSnapshot) {
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
