import Client from "./Client";
import toTitleCase from "./utils/toTitleCase";
import {getBehaviorSettings} from "@modules/core/settings";
import type {GmcpCharInfo, GmcpCharState} from "@shared/events";

export interface ObjectData {
    desc?: string;
    hp?: number;
    attack_num?: boolean | number;
    attack_target?: boolean;
    defense_target?: boolean;
    avatar_target?: boolean;
    state?: any;

    [key: string]: any;
}

export default class ObjectManager {
    private client: Client;
    private nums: number[] = [];
    private data: Map<number, ObjectData> = new Map();
    private playerNum?: number;
    private teamShortcutHistory: Map<string, string> = new Map();
    private nextTeamShortcutIndex = 0;

    constructor(client: Client) {
        this.client = client;
        this.client.on('gmcp.objects.nums', (nums: number[]) => {
            this.handleNums(nums);
        });
        this.client.on('gmcp.objects.data', detail => {
            this.handleData(detail);
        });
        this.client.on('gmcp.char.info', detail => {
            this.handleCharInfo(detail);
        });
        this.client.on('gmcp.char.state', detail => {
            this.handleCharState(detail);
        });
    }

    private handleNums(nums: number[]) {
        this.nums = nums;
        this.client.emit('parsedNums', { nums: nums });
    }

    private getOrCreateData(num: number): ObjectData {
        if (!this.data[num]) {
            this.data[num] = {};
        }
        return this.data[num];
    }

    private handleData(detail: Map<number, ObjectData>) {
        if (detail && typeof detail === 'object') {
            Object.keys(detail).forEach(num => {
                const data = this.getOrCreateData(parseInt(num));
                Object.assign(data, detail[num]);
            });
        }
        this.client.emit('parsedObjects');
    }

    private handleCharInfo(detail: GmcpCharInfo) {
        if (detail && typeof detail.object_num !== 'undefined') {
            this.playerNum = detail.object_num;
            const data = this.getOrCreateData(this.playerNum);
            if (detail.name) {
                data.desc = toTitleCase(detail.name);
            }
        }
    }

    private handleCharState(detail: GmcpCharState) {
        if (this.playerNum && detail && typeof detail.hp !== 'undefined') {
            const data = this.getOrCreateData(this.playerNum);
            data.hp = detail.hp;
        }
    }

    getObjectsOnLocation() {
        type Obj = {
            num: number,
            desc: string | undefined,
            hp: number | undefined,
            attack_num: boolean | number | undefined,
            avatar_target: boolean | undefined,
            shortcut?: string,
            __category?: 'player' | 'team' | 'rest' | 'rest-noncombat',
        };

        const makeObj = (num: number): Obj => {
            const obj = this.data[num] || {};
            return {
                num: num,
                desc: obj.desc,
                hp: obj.hp,
                attack_num: obj.attack_num,
                avatar_target: obj.avatar_target,
                attack_target: obj.attack_target,
                defense_target: obj.defense_target,
            } as Obj;
        };

        const playerObj = this.playerNum ? makeObj(this.playerNum) : undefined;
        const team: Obj[] = [];
        const rest: Obj[] = [];

        this.nums.forEach(n => {
            if (this.playerNum && n === this.playerNum) {
                return;
            }
            const o = makeObj(n);
            if ((this.data[n] as any)?.team) {
                team.push(o);
            } else {
                rest.push(o);
            }
        });

        const inCombat = [playerObj, ...team, ...rest].some(
            o => o && o.attack_num !== false && o.attack_num !== undefined
        );

        const combatRest = rest.filter(o => o.attack_num !== false && o.attack_num !== undefined)
        const nonCombatRest = rest.filter(o => o.attack_num === false || o.attack_num === undefined)

        // Assign shortcuts to team members first
        team.forEach(o => {
            o.shortcut = this.getTeamShortcut(o.num);
        });

        // Sort team members by their shortcuts
        team.sort((a, b) => {
            const aShortcut = a.shortcut || '';
            const bShortcut = b.shortcut || '';
            return aShortcut.localeCompare(bShortcut);
        });

        const ordered: Obj[] = [];
        if (playerObj) {
            playerObj.__category = 'player';
            ordered.push(playerObj);
        }
        team.forEach(o => {
            o.__category = 'team';
            ordered.push(o);
        });
        combatRest.forEach(o => {
            o.__category = 'rest';
            ordered.push(o);
        });
        nonCombatRest.forEach(o => {
            o.__category = 'rest-noncombat';
            ordered.push(o);
        });

        const teamNumberingMode = getBehaviorSettings().teamNumberingMode;

        if (teamNumberingMode === 'numbers') {
            let index = 1;
            let nonCombatIndex = 50;
            ordered.forEach(o => {
                if (o.__category === 'player') {
                    o.shortcut = '@';
                } else if (o.__category === 'rest-noncombat') {
                    o.shortcut = String(inCombat ? nonCombatIndex++ : index++);
                } else {
                    // Both team and rest (enemies) get sequential numbers
                    o.shortcut = String(index++);
                }
            });
        } else {
            let restIndex = 1;
            let nonCombatIndex = inCombat ? 50 : 1;
            ordered.forEach(o => {
                if (o.__category === 'player') {
                    o.shortcut = '@';
                } else if (o.__category === 'team') {
                    // Shortcut already assigned and sorted above
                } else if (o.__category === 'rest-noncombat') {
                    o.shortcut = String(nonCombatIndex++);
                } else {
                    o.shortcut = String(restIndex++);
                }
            });
        }

        return ordered;
    }

    public resolveObjectIds(command: string): string {
        return command.replace(/ob_(\d+)/g, (match, numStr) => {
            const num = parseInt(numStr);
            const obj = this.data[num];
            return obj?.desc ? `&lt;${obj.desc}&gt;` : match;
        });
    }

    public hasEnemiesOnLocation() {
        return this.getObjectsOnLocation().filter(item => item.__category == "rest").length > 0;
    }

    public resetTeamShortcuts() {
        this.teamShortcutHistory.clear();
        this.nextTeamShortcutIndex = 0;
        this.client.emit('parsedObjects');
    }

    private indexToShortcut(index: number): string {
        let result = '';
        let n = index;
        do {
            result = String.fromCharCode(65 + (n % 26)) + result;
            n = Math.floor(n / 26) - 1;
        } while (n >= 0);
        return result;
    }

    private getTeamShortcut(num: number): string {
        const key = String(num);
        const existingShortcut = this.teamShortcutHistory.get(key);
        if (existingShortcut) {
            return existingShortcut;
        }

        const shortcut = this.indexToShortcut(this.nextTeamShortcutIndex++);
        this.teamShortcutHistory.set(key, shortcut);
        return shortcut;
    }
}
