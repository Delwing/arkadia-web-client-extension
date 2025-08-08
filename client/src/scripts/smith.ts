import Client from "../Client";
import { takeFromBag, containerAction } from "./bagManager";

export default function initSmith(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    const tag = "smith";
    const REPAIR_CMD = "naostrz wszystkie bronie;napraw wszystkie zbroje";
    const DEFAULT_CMD = "wlm;dobadz wszystkich broni;zaloz wszystkie zbroje";

    let working = false;
    let timer: number | null = null;

    const scheduleDefault = () => {
        if (timer !== null) {
            clearTimeout(timer);
        }
        timer = window.setTimeout(() => {
            if (!working) {
                client.FunctionalBind.set(DEFAULT_CMD);
            }
            timer = null;
        }, 1000);
    };

    const startWork = (): undefined => {
        working = true;
    };

    const endWork = (): undefined => {
        if (working) {
            working = false;
            client.FunctionalBind.set(REPAIR_CMD);
        }
    };

    const nothingToRepair = (): undefined => {
        working = false;
        scheduleDefault();
    };

    client.Triggers.registerTrigger(/konczy prace\.$/, endWork, tag);
    client.Triggers.registerTrigger(/\bdaje ci/, endWork, tag);
    client.Triggers.registerTrigger(/do ciebie: .+ nie (?:nadaj|wymaga).* (?:ostrzenia|naprawy)/, nothingToRepair, tag);
    client.Triggers.registerTrigger(/do ciebie: Zobacze co da sie zrobic\./, startWork, tag);

    if (aliases) {
        aliases.push({
            pattern: /^\/(naprawa|napraw)$/,
            callback: () => {
                takeFromBag(client, "monety", "money");
                working = false;
                client.sendCommand("naostrz wszystkie bronie");
                client.sendCommand("napraw wszystkie zbroje");
            },
        });
        aliases.push({
            pattern: /^\/napraw_ubrania$/,
            callback: () => {
                takeFromBag(client, "monety", "money");
                client.sendCommand("zdejmij wszystkie zbroje");
                client.sendCommand("napraw wszystkie ubrania");
                client.sendCommand("zaloz wszystkie ubrania");
                client.sendCommand("zaloz wszystkie zbroje");
                containerAction(client, "money", "put", "monety");
            },
        });
    }
}
