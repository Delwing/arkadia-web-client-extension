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
        this.client.on('gmcp.objects.nums', detail => {
            this.handleNums(detail);
        });
        this.client.on('gmcp.objects.data', detail => {
            this.handleData(detail as Record<string, ObjectData>);
        });
        this.client.on('gmcp.char.info', detail => {
            this.handleCharInfo(detail);
        });
        this.client.on('gmcp.char.state', detail => {
            this.handleCharState(detail);
        });
    }

    private handleNums(detail: unknown) {
        let incoming: unknown[] | undefined;
        if (Array.isArray(detail)) {
            incoming = detail;
        } else if (detail && typeof detail === 'object') {
            const payload = detail as { nums?: unknown[]; objects?: unknown[] };
            if (Array.isArray(payload.nums)) {
                incoming = payload.nums;
            } else if (Array.isArray(payload.objects)) {
                incoming = payload.objects;
            }
        }

        if (!incoming) {
            return;
        }

        this.nums = incoming.map(item => String(item));
        const numeric = incoming
            .map(item => Number(item))
            .filter(num => Number.isFinite(num));

        this.client.emit('parsedNums', { nums: numeric });
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
        this.client.emit('parsedObjects');
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

        const makeObj = (numStr: string): Obj => {
            const obj = this.data[numStr] || {};
            return {
                num: parseInt(numStr),
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
