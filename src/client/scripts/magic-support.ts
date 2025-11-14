import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors.ts";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";


export default function initMagicSupport(client: Client) {

    function magicPrefixCallback(prefix) {
        return (line: AnsiAwareBuffer): AnsiAwareBuffer => line.prepend(`[${prefix}] `, createColorFormat("#ff6347"));
    }

    function bindCallBack(command) {
        return (line: AnsiAwareBuffer): AnsiAwareBuffer => {
            client.FunctionalBind.set(command, () => client.sendCommand(command));
            return line;
        }
    }

    client.Triggers.registerTrigger([
        "Od twojego amuletu emanuje przyjemne cieplo.",
        "Nagle kamienie na rekojesci miecza zaczynaja",
        "rozjarzaja sie na moment trzy krwistoczerwone ogniki.",
        "Widzisz jak ogromny ognisty trojzab przysysa sie na moment do rany"
    ], magicPrefixCallback("HP+"))

    client.Triggers.registerTrigger([
        "Powolne, pozbawione sily ruchy wroga zagrzewaja cie do walki, dodajac zapalu",
        "Z kazdym kolejnym ciosem nabierasz nowej sily do walki",
        "Kazdy kolejny charczacy oddech opadajacego z sil przeciwnika tylko daje ci nowy zapal do walki",
        "Widok slabnacego wroga tylko dodaje ci sil",
    ], magicPrefixCallback("TASAK"))

    client.Triggers.registerTrigger([
        /Plynnym, pelnym pewnosci ruchem dobywasz misternego obosiecznego topora. Odruchowo poprawiajac uchwyt wywijasz nim szybkiego mlynka i ustawiasz sie tak, by w kazdej chwili moc wyprowadzic uderzenie/,
        /Chwytasz stylisko misternego obosiecznego topora w garsc i wykonujesz nim kilka probnych wymachow, oswajajac sie z nietypowym wywazeniem oreza/,
        /^Siegasz do .+? temblaka.*, dobywajac z niego misternego obosiecznego topora\.$/,
    ], bindCallBack("przekrec stylisko"))


    client.Triggers.registerTrigger([
        "Zakladasz szmaragdowozielony misterny plaszcz."
    ], bindCallBack("zepnij plaszcz brosza"))

    client.Triggers.registerTrigger([
        "Zakladasz masywny oksydowany pas."
    ], bindCallBack("zacisnij pas"))

}
