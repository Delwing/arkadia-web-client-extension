import Client from "../Client";
import { containerAction, getContainer, ContainerType } from "./bagManager";
import { type CollectOverride, defaultSettings } from "@modules/core/defaultSettings";
import { getBodyExtras, getBodyStertyMap, clearBodyExtras } from "./lootParser";
import { characterStorage } from "@modules/core/storage";

type KillerType = "ME" | "TEAM" | "OTHER";

enum CollectionMode {
    All = 1,
    Leader = 2,
    Team = 3,
    None = 4,
}

enum CollectionTiming {
    AtEnd = 1,
    AfterEachKill = 2,
    Both = 3,
}

interface KillRecord {
    killer: KillerType;
    hasBody: boolean;
    // Bodiless enemies leave their loot on the floor; only those with an override are picked up there.
    onFloor: boolean;
    collected: boolean;
    enemyDesc?: string;
}

interface CollectionPrefs {
    collectCopper: boolean;
    collectSilver: boolean;
    collectGold: boolean;
    collectGems: boolean;
    extra: string[];
}

interface CollectionResult {
    money: boolean;
    gems: boolean;
    extras: string[];
}

export default class ItemCollector {
    private client: Client;

    private collectionMode: CollectionMode = CollectionMode.All;
    private collectionTiming: CollectionTiming = CollectionTiming.AtEnd;
    private collectCopper = true;
    private collectSilver = true;
    private collectGold = true;
    private collectGems = true;
    extra: string[] = [];
    private overrides: CollectOverride[] = [];
    private kills: KillRecord[] = [];
    private bindActive = false;

    constructor(client: Client) {
        this.client = client;

        this.applySettings(characterStorage.get('settings') ?? defaultSettings);
        characterStorage.onChange('settings', (payload) => {
            this.applySettings(payload ?? defaultSettings);
        });

        this.client.on("enemyKilled", (event) => {
            this.recordKill(event.killer, this.resolveHasBody(event), event.enemyDesc);
            if (this.collectionTiming === CollectionTiming.AfterEachKill || this.collectionTiming === CollectionTiming.Both) {
                this.handleAfterKillCollection();
            }
        });

        this.client.on("enterLocation", () => {
            this.resetKills();
        });

        this.client.on("allEnemiesKilled", () => {
            if (this.collectionTiming === CollectionTiming.AtEnd || this.collectionTiming === CollectionTiming.Both) {
                this.handleAtEndCollection();
            }
        });
    }

    private applySettings(settings: any) {
        if (typeof settings.collectMode === "number") {
            this.setMode(settings.collectMode);
        }

        if (typeof settings.collectTiming === "number") {
            this.setTiming(settings.collectTiming);
        }

        if (Array.isArray(settings.collectExtra)) {
            this.extra = [...settings.collectExtra];
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
        if (Array.isArray(settings.collectOverrides)) {
            this.overrides = [...settings.collectOverrides];
        }
    }

    private setMode(mode: number) {
        const normalized = Math.round(mode);
        if (normalized >= CollectionMode.All && normalized <= CollectionMode.None) {
            this.collectionMode = normalized as CollectionMode;
        } else {
            this.collectionMode = CollectionMode.All;
        }
    }

    private setTiming(timing: number) {
        const normalized = Math.round(timing);
        if (normalized >= CollectionTiming.AtEnd && normalized <= CollectionTiming.Both) {
            this.collectionTiming = normalized as CollectionTiming;
        } else {
            this.collectionTiming = CollectionTiming.AtEnd;
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

    private formatBodyTarget(index?: number, stertyIndex?: number) {
        if (stertyIndex != null) {
            return `${stertyIndex}. sterty`;
        }
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

    private collectGemstones(from: string): boolean {
        this.client.sendCommand(`wez kamienie${from}`);
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

    private findOverride(enemyDesc?: string): CollectOverride | undefined {
        if (!enemyDesc) return undefined;
        const descLower = enemyDesc.toLowerCase();
        return this.overrides.find(o => descLower.includes(o.enemy.toLowerCase()));
    }

    private getCollectionPrefs(enemyDesc?: string): CollectionPrefs {
        const override = this.findOverride(enemyDesc);
        if (override) {
            return {
                collectCopper: override.collectCopper,
                collectSilver: override.collectSilver,
                collectGold: override.collectGold,
                collectGems: override.collectGems,
                extra: override.collectExtra,
            };
        }
        return {
            collectCopper: this.collectCopper,
            collectSilver: this.collectSilver,
            collectGold: this.collectGold,
            collectGems: this.collectGems,
            extra: this.extra,
        };
    }

    private shouldCollectAnythingForEnemy(enemyDesc?: string): boolean {
        const prefs = this.getCollectionPrefs(enemyDesc);
        return prefs.collectCopper || prefs.collectSilver || prefs.collectGold || prefs.collectGems || prefs.extra.length > 0;
    }

    // A null target picks the loot up off the floor.
    private collectLoot(target: string | null, prefs: CollectionPrefs, bodyIndex?: number | null): CollectionResult {
        const result: CollectionResult = { money: false, gems: false, extras: [] };
        const from = target ? ` z ${target}` : "";
        if (prefs.collectCopper || prefs.collectSilver || prefs.collectGold) {
            result.money = this.collectCoinsWithPrefs(from, prefs);
        }
        if (prefs.collectGems) {
            result.gems = this.collectGemstones(from);
        }
        if (prefs.extra.length > 0) {
            prefs.extra.forEach((it) => {
                this.client.sendCommand(`wez ${it}${from}`);
                result.extras.push(it);
            });
        }
        // Collect magics/keys discovered during body inspection
        const lootExtras = target ? getBodyExtras().get(bodyIndex ?? null) : undefined;
        if (lootExtras && lootExtras.length > 0) {
            for (const item of lootExtras) {
                this.client.sendCommand(`wez ${item}${from}`);
                result.extras.push(item);
            }
        }
        return result;
    }

    private collectCoinsWithPrefs(from: string, prefs: CollectionPrefs): boolean {
        if (prefs.collectCopper && prefs.collectSilver && prefs.collectGold) {
            this.client.sendCommand(`wez monety${from}`);
            return true;
        }
        let collected = false;
        if (prefs.collectCopper) {
            this.client.sendCommand(`wez miedziane monety${from}`);
            collected = true;
        }
        if (prefs.collectSilver) {
            this.client.sendCommand(`wez srebrne monety${from}`);
            collected = true;
        }
        if (prefs.collectGold) {
            this.client.sendCommand(`wez zlote monety${from}`);
            collected = true;
        }
        return collected;
    }

    private mergePrefs(into: CollectionPrefs | null, prefs: CollectionPrefs): CollectionPrefs {
        if (!into) {
            return { ...prefs, extra: [...prefs.extra] };
        }
        return {
            collectCopper: into.collectCopper || prefs.collectCopper,
            collectSilver: into.collectSilver || prefs.collectSilver,
            collectGold: into.collectGold || prefs.collectGold,
            collectGems: into.collectGems || prefs.collectGems,
            extra: [...into.extra, ...prefs.extra.filter((it) => !into.extra.includes(it))],
        };
    }

    private recordKill(killer: KillerType, hasBody: boolean, enemyDesc?: string) {
        // Without an override a bodiless kill would fall back to the global prefs and sweep
        // the floor after every ghost, so the floor is only searched for enemies set up for it.
        const onFloor = !hasBody && this.findOverride(enemyDesc) !== undefined;
        this.kills.push({ killer, hasBody, onFloor, collected: !hasBody && !onFloor, enemyDesc });
    }

    private hasLoot(record: KillRecord): boolean {
        return record.hasBody || record.onFloor;
    }

    private resetKills() {
        this.kills = [];
        if (this.bindActive) {
            this.client.FunctionalBind.clearCategory('loot');
            this.bindActive = false;
        }
    }

    private resolveHasBody(event: { hasBody?: boolean } | undefined): boolean {
        if (event && typeof event.hasBody === "boolean") {
            return event.hasBody;
        }
        return true;
    }

    // AfterEachKill: Create bind for the most recent kill
    private handleAfterKillCollection() {
        if (this.collectionMode === CollectionMode.None) {
            return;
        }

        // Find the most recent uncollected body
        const lastKill = this.kills[this.kills.length - 1];
        if (lastKill && this.hasLoot(lastKill) && !lastKill.collected && this.shouldCollectForKill(lastKill.killer)) {
            // Check if there's anything to collect for this enemy (considering overrides)
            if (!this.shouldCollectAnythingForEnemy(lastKill.enemyDesc)) {
                return;
            }
            const label = lastKill.hasBody ? "wez z ciala" : "wez z ziemi";
            this.client.FunctionalBind.setCategory('loot', label, () => this.collectLastBody());
            this.bindActive = true;
        }
    }

    private collectLastBody() {
        if (this.collectionMode === CollectionMode.None) {
            return;
        }

        // Find the most recent uncollected body
        for (let i = this.kills.length - 1; i >= 0; i--) {
            const record = this.kills[i];
            if (!this.hasLoot(record) || record.collected) {
                continue;
            }
            if (!this.shouldCollectForKill(record.killer)) {
                record.collected = true;
                continue;
            }
            if (!this.shouldCollectAnythingForEnemy(record.enemyDesc)) {
                record.collected = true;
                continue;
            }

            // Collect from this body (always use "ciala" without index for the most recent)
            const target = record.hasBody ? this.formatBodyTarget() : null;
            const result = this.collectLoot(target, this.getCollectionPrefs(record.enemyDesc), null);
            if (result.gems) {
                this.client.sendCommand("ocen kamienie");
            }
            this.depositCollected(result.money, result.gems, result.extras);
            record.collected = true;

            // Clear bind after collection
            this.client.FunctionalBind.clearCategory('loot');
            this.bindActive = false;
            return;
        }
    }

    // AtEnd: Create bind for all bodies
    private handleAtEndCollection() {
        if (this.collectionMode === CollectionMode.None) {
            return;
        }

        // In "Both" mode, collect from all bodies regardless of collected status
        // In "AtEnd" mode, only collect from uncollected bodies
        const isBothMode = this.collectionTiming === CollectionTiming.Both;
        const pending = this.kills.filter((record) => {
            if (!this.hasLoot(record) || !this.shouldCollectForKill(record.killer)) {
                return false;
            }
            if (!this.shouldCollectAnythingForEnemy(record.enemyDesc)) {
                return false;
            }
            return isBothMode || !record.collected;
        });

        if (pending.length > 0) {
            const label = pending.some((record) => record.hasBody) ? "wez z ciala" : "wez z ziemi";
            this.client.FunctionalBind.setCategory('loot', label, () => this.collectAllBodies());
            this.bindActive = true;
        }
    }

    private collectAllBodies() {
        if (this.collectionMode === CollectionMode.None) {
            return;
        }

        let currentBodyIndex = 0;
        const aggregated: CollectionResult = { money: false, gems: false, extras: [] };
        let collectedAny = false;
        const isBothMode = this.collectionTiming === CollectionTiming.Both;
        const stertyMap = getBodyStertyMap();
        // Whatever bodiless enemies dropped lies in one heap, so the floor is swept once for all of them.
        let floorPrefs: CollectionPrefs | null = null;

        // Iterate backwards through kills to match body numbering
        for (let i = this.kills.length - 1; i >= 0; i--) {
            const record = this.kills[i];
            if (!record.hasBody) {
                if (record.onFloor && (isBothMode || !record.collected) && this.shouldCollectForKill(record.killer)) {
                    if (this.shouldCollectAnythingForEnemy(record.enemyDesc)) {
                        floorPrefs = this.mergePrefs(floorPrefs, this.getCollectionPrefs(record.enemyDesc));
                    }
                    record.collected = true;
                }
                continue;
            }
            currentBodyIndex++;

            // In "Both" mode, collect from all bodies regardless of collected status
            // In "AtEnd" mode, skip already collected bodies
            if (!isBothMode && record.collected) {
                continue;
            }
            if (!this.shouldCollectForKill(record.killer)) {
                continue;
            }
            if (!this.shouldCollectAnythingForEnemy(record.enemyDesc)) {
                record.collected = true;
                continue;
            }

            const stertyIndex = stertyMap.get(currentBodyIndex);
            const target = this.formatBodyTarget(currentBodyIndex, stertyIndex);
            const result = this.collectLoot(target, this.getCollectionPrefs(record.enemyDesc), currentBodyIndex);
            aggregated.money = aggregated.money || result.money;
            aggregated.gems = aggregated.gems || result.gems;
            if (result.extras.length > 0) {
                aggregated.extras.push(...result.extras);
            }
            record.collected = true;
            collectedAny = true;
        }

        if (floorPrefs) {
            const result = this.collectLoot(null, floorPrefs);
            aggregated.money = aggregated.money || result.money;
            aggregated.gems = aggregated.gems || result.gems;
            aggregated.extras.push(...result.extras);
            collectedAny = true;
        }

        if (collectedAny) {
            if (aggregated.gems) {
                this.client.sendCommand("ocen kamienie");
            }
            this.depositCollected(aggregated.money, aggregated.gems, aggregated.extras);
        }

        clearBodyExtras();

        // Clear bind after collection
        this.client.FunctionalBind.clearCategory('loot');
        this.bindActive = false;
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
