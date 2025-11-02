import Client from "../Client";
import { containerAction, getContainer, ContainerType } from "./bagManager";

type KillerType = "ME" | "TEAM" | "OTHER";

enum CollectionMode {
    All = 1,
    Leader = 2,
    Team = 3,
    None = 4,
}

interface KillRecord {
    killer: KillerType;
    hasBody: boolean;
    collected: boolean;
}

interface CollectionResult {
    money: boolean;
    gems: boolean;
    extras: string[];
}

export default class ItemCollector {
    private client: Client;

    private collectionMode: CollectionMode = CollectionMode.All;
    private collectCopper = true;
    private collectSilver = true;
    private collectGold = true;
    private collectGems = true;
    extra: string[] = [];
    private kills: KillRecord[] = [];
    private bindActive = false;

    constructor(client: Client) {
        this.client = client;
        this.client.addEventListener("settings", (ev: CustomEvent) => {
            this.applySettings(ev.detail || {});
        });

        this.client.eventTarget.on("enemyKilled", (ev) => {
            this.recordKill(ev.killer, this.resolveHasBody(ev));
        });

        this.client.eventTarget.on("enterLocation", () => {
            this.resetKills();
        });

        this.client.eventTarget.on("allEnemiesKilled", () => {
            this.collectPendingBodies();
        });
    }

    private applySettings(settings: any) {
        const isLegacy = this.isLegacySettings(settings);

        if (typeof settings.collectMode === "number") {
            this.setMode(settings.collectMode, isLegacy);
        }

        if (Array.isArray(settings.collectExtra)) {
            this.extra = [...settings.collectExtra];
        }

        if (isLegacy) {
            this.applyLegacyCoinPreferences(settings);
            this.collectGems = this.shouldCollectGemsLegacy(settings.collectMode);
            return;
        }

        if (typeof settings.collectCopper === "boolean") {
            this.collectCopper = settings.collectCopper;
        }
        if (typeof settings.collectSilver === "boolean") {
            this.collectSilver = settings.collectSilver;
        }
        if (typeof settings.collectGold === "boolean") {
            this.collectGold = settings.collectGold;
        }
        if (typeof settings.collectGems === "boolean") {
            this.collectGems = settings.collectGems;
        }
    }

    private setMode(mode: number, isLegacy: boolean) {
        if (isLegacy) {
            this.collectionMode = this.translateLegacyMode(mode);
            return;
        }
        const normalized = Math.round(mode);
        if (normalized >= CollectionMode.All && normalized <= CollectionMode.None) {
            this.collectionMode = normalized as CollectionMode;
        } else {
            this.collectionMode = CollectionMode.All;
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

    private formatBodyTarget(index?: number) {
        return index != null ? `${index}. ciala` : "ciala";
    }

    private depositCollected(money: boolean, gems: boolean, extras: string[]) {
        if (!money && !gems && extras.length === 0) {
            return;
        }
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

    private collectCoins(from: string): boolean {
        if (this.collectCopper && this.collectSilver && this.collectGold) {
            this.client.sendCommand(`wez monety z ${from}`);
            return true;
        }
        let collected = false;
        if (this.collectCopper) {
            this.client.sendCommand(`wez miedziane monety z ${from}`);
            collected = true;
        }
        if (this.collectSilver) {
            this.client.sendCommand(`wez srebrne monety z ${from}`);
            collected = true;
        }
        if (this.collectGold) {
            this.client.sendCommand(`wez zlote monety z ${from}`);
            collected = true;
        }
        return collected;
    }

    private collectGemstones(from: string): boolean {
        this.client.sendCommand(`wez kamienie z ${from}`);
        this.client.sendCommand("ocen kamienie");
        return true;
    }

    private shouldCollectForKill(killer: KillerType): boolean {
        switch (this.collectionMode) {
            case CollectionMode.All:
                return true;
            case CollectionMode.Leader:
                return !this.client.TeamManager.isInAnyTeam() || this.client.TeamManager.isLeader();
            case CollectionMode.Team:
                return !this.client.TeamManager.isInAnyTeam() || killer === "ME" || killer === "TEAM";
            default:
                return false;
        }
    }

    private shouldCollectAnything(): boolean {
        return this.collectCopper || this.collectSilver || this.collectGold || this.collectGems || this.extra.length > 0;
    }

    private isLegacySettings(settings: any): boolean {
        return typeof settings.collectMoneyType === "number";
    }

    private translateLegacyMode(mode: number): CollectionMode {
        if (mode === 7) {
            return CollectionMode.None;
        }
        if (mode >= 4 && mode <= 6) {
            return CollectionMode.Team;
        }
        return CollectionMode.All;
    }

    private applyLegacyCoinPreferences(settings: any) {
        const legacyMode = typeof settings.collectMode === "number" ? settings.collectMode : undefined;
        const collectsCoins = legacyMode === undefined ? true : [1, 3, 4, 6].includes(legacyMode);
        if (!collectsCoins) {
            this.collectCopper = false;
            this.collectSilver = false;
            this.collectGold = false;
            return;
        }

        const legacyMoneyType = typeof settings.collectMoneyType === "number" ? settings.collectMoneyType : 1;
        if (legacyMoneyType === 3) {
            this.collectCopper = false;
            this.collectSilver = false;
            this.collectGold = true;
        } else if (legacyMoneyType === 2) {
            this.collectCopper = false;
            this.collectSilver = true;
            this.collectGold = true;
        } else {
            this.collectCopper = true;
            this.collectSilver = true;
            this.collectGold = true;
        }
    }

    private shouldCollectGemsLegacy(mode?: number): boolean {
        if (typeof mode !== "number") {
            return this.collectGems;
        }
        return [2, 3, 5, 6].includes(mode);
    }

    private collectBody(target: string): CollectionResult {
        const result: CollectionResult = { money: false, gems: false, extras: [] };
        if (this.collectCopper || this.collectSilver || this.collectGold) {
            result.money = this.collectCoins(target);
        }
        if (this.collectGems) {
            result.gems = this.collectGemstones(target);
        }
        if (this.extra.length > 0) {
            this.extra.forEach((it) => {
                this.client.sendCommand(`wez ${it} z ${target}`);
                result.extras.push(it);
            });
        }
        return result;
    }

    private recordKill(killer: KillerType, hasBody: boolean) {
        this.kills.push({ killer, hasBody, collected: !hasBody });
    }

    private resetKills() {
        this.kills = [];
        if (this.bindActive) {
            this.client.FunctionalBind.clear();
            this.bindActive = false;
        }
    }

    private resolveHasBody(event: { hasBody?: boolean } | undefined): boolean {
        if (event && typeof event.hasBody === "boolean") {
            return event.hasBody;
        }
        return true;
    }

    private collectPendingBodies() {
        if (!this.shouldCollectAnything() || this.collectionMode === CollectionMode.None) {
            return;
        }
        this.scheduleCollectBind();
    }

    private hasUncollectedBodies(): boolean {
        if (this.collectionMode === CollectionMode.None) {
            return false;
        }
        return this.kills.some((record) => this.shouldCollectForKill(record.killer));
    }

    private scheduleCollectBind() {
        if (this.hasUncollectedBodies() && this.shouldCollectAnything()) {
            this.client.FunctionalBind.set("wez z ciala", () => this.collectAllPendingBodies());
            this.bindActive = true;
        } else if (this.bindActive) {
            this.client.FunctionalBind.clear();
            this.bindActive = false;
        }
    }

    private collectAllPendingBodies() {
        if (!this.shouldCollectAnything() || this.collectionMode === CollectionMode.None) {
            return;
        }

        let currentBodyIndex = 0;
        const aggregated: CollectionResult = { money: false, gems: false, extras: [] };
        let collectedAny = false;

        for (let i = this.kills.length - 1; i >= 0; i--) {
            const record = this.kills[i];
            if (!record.hasBody) {
                record.collected = true;
                continue;
            }
            currentBodyIndex++;
            if (record.collected || !this.shouldCollectForKill(record.killer)) {
                continue;
            }
            const target = this.formatBodyTarget(currentBodyIndex);
            const result = this.collectBody(target);
            aggregated.money = aggregated.money || result.money;
            aggregated.gems = aggregated.gems || result.gems;
            if (result.extras.length > 0) {
                aggregated.extras.push(...result.extras);
            }
            record.collected = true;
            collectedAny = true;
        }

        if (collectedAny) {
            this.depositCollected(aggregated.money, aggregated.gems, aggregated.extras);
        }

        this.scheduleCollectBind();
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
