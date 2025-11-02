import Client from "./Client";
import toTitleCase from "./utils/toTitleCase";

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
    private nums: string[] = [];
    private data: Record<string, ObjectData> = {};
    private playerNum?: string;
    private teamShortcutHistory: Map<string, string> = new Map();
    private nextTeamShortcutCode = 'A'.charCodeAt(0);

    constructor(client: Client) {
        this.client = client;
        this.client.addEventListener('gmcp.objects.nums', (e: CustomEvent<number[]>) => {
            this.handleNums(e.detail);
        });
        this.client.addEventListener('gmcp.objects.data', (e: CustomEvent) => {
            this.handleData(e.detail);
        });
        this.client.addEventListener('gmcp.char.info', (e: CustomEvent) => {
            this.handleCharInfo(e.detail);
        });
        this.client.addEventListener('gmcp.char.state', (e: CustomEvent) => {
            this.handleCharState(e.detail);
        });
    }

    private handleNums(detail: number[]) {
        if (Array.isArray(detail)) {
            this.nums = detail.map(String);
        }
        this.client.eventTarget.emit('parsedNums', {nums: detail})
    }

    private getOrCreateData(num: string): ObjectData {
        if (!this.data[num]) {
            this.data[num] = {};
        }
        return this.data[num];
    }

    private handleData(detail: Record<string, ObjectData>) {
        if (detail && typeof detail === 'object') {
            Object.keys(detail).forEach(num => {
                const data = this.getOrCreateData(num);
                Object.assign(data, detail[num]);
            });
        }
        this.client.eventTarget.emit('parsedObjects')
    }

    private handleCharInfo(detail: any) {
        if (detail && typeof detail.object_num !== 'undefined') {
            this.playerNum = String(detail.object_num);
            const data = this.getOrCreateData(this.playerNum);
            if (detail.name) {
                data.desc = toTitleCase(detail.name);
            }
        }
    }

    private handleCharState(detail: any) {
        if (this.playerNum && detail && typeof detail.hp !== 'undefined') {
            const data = this.getOrCreateData(this.playerNum);
            data.hp = detail.hp;
            data.state = detail.hp;
        }
    }

    getObjectsOnLocation() {
        type Obj = {
            num: number,
            desc: string | undefined,
            state: any,
            attack_num: boolean | number | undefined,
            avatar_target: boolean | undefined,
            shortcut?: string,
            __category?: 'player' | 'team' | 'rest' | 'rest-noncombat',
        };

        const makeObj = (numStr: string): Obj => {
            const obj = this.data[numStr] || {};
            return {
                num: parseInt(numStr),
                desc: obj.desc,
                state: obj.state ?? obj.hp,
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

        let restIndex = 1;
        let nonCombatIndex = inCombat ? 50 : 1;
        ordered.forEach(o => {
            if (o.__category === 'player') {
                o.shortcut = '@';
            } else if (o.__category === 'team') {
                o.shortcut = this.getTeamShortcut(o.num);
            } else if (o.__category === 'rest-noncombat') {
                o.shortcut = String(nonCombatIndex++);
            } else {
                o.shortcut = String(restIndex++);
            }
        });

        return ordered;
    }

    public hasEnemiesOnLocation() {
        return this.getObjectsOnLocation().filter(item => item.__category == "rest").length > 0;
    }

    private getTeamShortcut(num: number): string {
        const key = String(num);
        const existingShortcut = this.teamShortcutHistory.get(key);
        if (existingShortcut) {
            return existingShortcut;
        }

        const shortcut = String.fromCharCode(this.nextTeamShortcutCode++);
        this.teamShortcutHistory.set(key, shortcut);
        return shortcut;
    }
}
