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

    constructor(client: Client) {
        this.client = client;
        this.client.addEventListener('gmcp.objects.nums', (e: CustomEvent) => {
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

    private handleNums(detail: any) {
        if (Array.isArray(detail)) {
            this.nums = detail.map(String);
        } else if (detail && Array.isArray(detail.nums)) {
            this.nums = detail.nums.map(String);
        } else if (detail && Array.isArray(detail.objects)) {
            this.nums = detail.objects.map(String);
        }
    }

    private handleData(detail: Record<string, ObjectData>) {
        if (detail && typeof detail === 'object') {
            Object.keys(detail).forEach(num => {
                if (!this.data[num]) {
                    this.data[num] = {};
                }
                Object.assign(this.data[num], detail[num]);
            });
        }
    }

    private handleCharInfo(detail: any) {
        if (detail && typeof detail.object_num !== 'undefined') {
            this.playerNum = String(detail.object_num);
            if (!this.data[this.playerNum]) {
                this.data[this.playerNum] = {};
            }
            if (detail.name) {
                this.data[this.playerNum].desc = toTitleCase(detail.name);
            }
        }
    }

    private handleCharState(detail: any) {
        if (this.playerNum && detail && typeof detail.hp !== 'undefined') {
            if (!this.data[this.playerNum]) {
                this.data[this.playerNum] = {};
            }
            this.data[this.playerNum].hp = detail.hp;
            this.data[this.playerNum].state = detail.hp;
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
            __category?: 'player' | 'team' | 'rest',
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

        const ordered: Obj[] = [];
        if (playerObj) {
            playerObj.__category = 'player';
            ordered.push(playerObj);
        }
        team.forEach(o => {
            o.__category = 'team';
            ordered.push(o);
        });
        rest.forEach(o => {
            o.__category = 'rest';
            ordered.push(o);
        });

        let teamIndex = 0;
        let restIndex = 1;
        ordered.forEach(o => {
            if (o.__category === 'player') {
                o.shortcut = '@';
            } else if (o.__category === 'team') {
                o.shortcut = String.fromCharCode('A'.charCodeAt(0) + teamIndex++);
            } else {
                o.shortcut = String(restIndex++);
            }
            delete o.__category;
        });

        return ordered;
    }
}
