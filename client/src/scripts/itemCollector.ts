import Client from "../Client";
import {containerAction, getContainer, ContainerType} from "./bagManager";
import appEventBus from "../events/app-event-bus";

class ItemCollector {
    private client: Client;
    private checkBody = false;

    modes = [
        "monety",
        "kamienie",
        "monety i kamienie",
        "druzynowe monety",
        "druzynowe kamienie",
        "druzynowe monety i kamienie",
        "nic",
    ];

    typeModes = ["wszystkie", "srebrne", "zlote"];

    moneyType = 1;
    currentMode = 3;
    extra: string[] = [];

    constructor(client: Client) {
        this.client = client;
        this.client.FunctionalBind.set(null, () => this.keyPressed(true));
        appEventBus.on("settings", settings => {
            if (typeof settings.collectMode === "number") {
                this.setMode(settings.collectMode);
            }
            if (typeof settings.collectMoneyType === "number") {
                this.setMoneyMode(settings.collectMoneyType);
            }
            if (Array.isArray(settings.collectExtra)) {
                this.extra = [...settings.collectExtra];
            }
        })

        appEventBus.on('killed', (event) => {
            if (!event.isTeamKill) {
                this.killedAction();
            } else {
                this.teamKilledAction();
            }
        });
    }

    setMode(mode: number) {
        if (this.modes[mode - 1]) {
            this.currentMode = mode;
        }
    }

    setMoneyMode(mode: number) {
        if (this.typeModes[mode - 1]) {
            this.moneyType = mode;
        }
    }

    keyPressed(force = false, index?: number) {
        const from = index != null ? `${index}. ciala` : "ciala";
        if (this.checkBody || force) {
            let money = false;
            let gems = false;
            const extras: string[] = [];
            if ([1, 3, 4, 6].includes(this.currentMode)) {
                if (this.moneyType === 1) {
                    this.client.sendCommand(`wez monety z ${from}`);
                    money = true;
                } else if (this.moneyType === 2) {
                    this.client.sendCommand(`wez srebrne monety z ${from}`);
                    this.client.sendCommand(`wez zlote monety z ${from}`);
                    money = true;
                } else if (this.moneyType === 3) {
                    this.client.sendCommand(`wez zlote monety z ${from}`);
                    money = true;
                }
            }
            if ([2, 3, 5, 6].includes(this.currentMode)) {
                this.client.sendCommand(`wez kamienie z ${from}`);
                this.client.sendCommand("ocen kamienie");
                gems = true;
            }
            this.extra.forEach((it) => {
                this.client.sendCommand(`wez ${it} z ${from}`);
                extras.push(it);
            });
            this.depositCollected(money, gems, extras);
            this.checkBody = false;
        }
    }

    killedAction() {
        if (this.currentMode !== 7 || this.extra.length > 0) {
            this.client.FunctionalBind.set("wez z ciala", () => this.keyPressed(true));
            this.checkBody = true;
        }
    }

    teamKilledAction() {
        if (
            (this.currentMode === 4 || this.currentMode === 5 || this.currentMode === 6 || this.extra.length > 0)
        ) {
            this.client.FunctionalBind.set("wez z ciala", () => this.keyPressed(true));
            this.checkBody = true;
        }
    }

    addExtra(item: string) {
        if (item) {
            this.extra.push(item);
        }
    }

    removeExtra(item?: string, clearAll?: boolean) {
        if (clearAll) {
            this.extra = [];
            return;
        }
        if (item) {
            this.extra = this.extra.filter((e) => e !== item);
        }
    }

    private depositCollected(money: boolean, gems: boolean, extras: string[]) {
        const bagItems: Record<string, { type: ContainerType; items: string[] }> = {};
        const add = (type: ContainerType, item: string) => {
            const bag = getContainer(type);
            if (!bag) return;
            if (!bagItems[bag]) {
                bagItems[bag] = {type, items: []};
            }
            bagItems[bag].items.push(item);
        };

        if (money) add("money", "monety");
        if (gems) add("gems", "kamienie");
        extras.forEach((it) => add("other", it));

        Object.values(bagItems).forEach(({type, items}) => {
            containerAction(this.client, type, "put", items.join(","));
        });
    }
}

export function initItemCollector(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
): ItemCollector {
    const collector = new ItemCollector(client);

    if (aliases) {
        aliases.push({
            pattern: /\/zbieraj_extra(.*)/,
            callback: (matches: RegExpMatchArray) => {
                const strTrim = (matches[1] || '').trim();
                collector.addExtra(strTrim);
            },
        });

        aliases.push({
            pattern: /\/nie_zbieraj_extra(.*)/,
            callback: (matches: RegExpMatchArray) => {
                const strTrim = (matches[1] || '').trim();
                if (strTrim !== '') {
                    collector.removeExtra(strTrim, false);
                } else {
                    collector.removeExtra('', true);
                }
            },
        });
    }

    return collector;
}
