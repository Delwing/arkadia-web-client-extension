import Client from "./Client";

interface ObjectData {
    attack_num: boolean | number
    attack_target: boolean
    defense_target: boolean
    desc: string
    hp: number
    hidden: false
    living: boolean
    team: boolean
    team_leader: boolean
    avatar_target?: boolean
}

/**
 * Represents data accumulated from multiple gmcp objects.data events.
 * All fields are optional because each event may provide only a subset of
 * {@link ObjectData} properties.
 */
interface AccumulatedObjectData {
    attack_num?: boolean | number
    attack_target?: boolean
    defense_target?: boolean
    desc?: string
    hp?: number
    hidden?: false
    living?: boolean
    team?: boolean
    team_leader?: boolean
    avatar_target?: boolean
}

export default class TeamManager {
    private client: Client;
    private members: Set<string> = new Set();
    private joined = false;
    private leader?: string;
    private leaderId?: string;
    private tag = 'teamManager';
    private accumulatedObjectsData: Record<string, AccumulatedObjectData> = {}
    private playerNum?: string;
    private leaderAttackTargetId?: string
    private avatarAttackTargetId?: string
    private attackTargetId?: string
    private defenseTargetId?: string
    private enemies: string[] = [];
    private missingEnemyCounts: Map<string, number> = new Map();
    private currentLocationSignature?: string;

    constructor(client: Client) {
        this.client = client;
        this.client.on('gmcp.objects.data', detail => {
            this.handleObjectsData(detail as Record<string, AccumulatedObjectData>);
        });
        this.client.on('gmcp.objects.nums', detail => {
            this.handleObjectsNums(detail);
        });
        this.client.on('gmcp.char.info', info => {
            const detail = info as { object_num?: unknown };
            if (detail?.object_num !== undefined) {
                this.playerNum = String(detail.object_num);
            }
        });
        this.client.on('gmcp.room.info', detail => {
            this.handleRoomInfo(detail);
        });
        if (typeof (this.client as any).Triggers?.registerTrigger === 'function') {
            this.registerTriggers();
        }
    }

    private handleObjectsData(data: Record<string, AccumulatedObjectData>) {
        Object.entries(data).forEach(([id, obj]) => {
            this.accumulatedObjectsData[id] = { ...(this.accumulatedObjectsData[id] ?? {}), ...obj };

            if (typeof obj.attack_target === 'boolean') {
                if (obj.attack_target) {
                    this.attackTargetId = id;
                } else if (this.attackTargetId === id) {
                    this.attackTargetId = undefined;
                }
            }

            if (typeof obj.defense_target === 'boolean') {
                if (obj.defense_target) {
                    this.defenseTargetId = id;
                } else if (this.defenseTargetId === id) {
                    this.defenseTargetId = undefined;
                }
            }

            this.checkTeam(obj, id);
            this.checkTeamLeader(obj, id);
            if (id === this.leaderId && obj.attack_num !== undefined) {
                this.leaderAttackTargetId = typeof obj.attack_num == "boolean" ? undefined : String(obj.attack_num)
            }
            if (id === this.playerNum && obj.attack_num !== undefined) {
                this.avatarAttackTargetId = typeof obj.attack_num == "boolean" ? undefined : String(obj.attack_num)
            }
            if (obj?.living === false) {
                this.removeEnemyFromQueue(id);
            }
        });
        if (this.leaderAttackTargetId && this.avatarAttackTargetId !== this.leaderAttackTargetId) {
            this.client.sendEvent('teamLeaderTargetNoAvatar', this.leaderAttackTargetId);
        } else  {
            this.client.sendEvent('teamLeaderTargetAvatar');
        }
    }

    private handleObjectsNums(detail: any) {
        if (this.enemies.length === 0) {
            return;
        }
        const previousQueue = this.enemies.join(",");
        let nums: string[] | null = null;
        if (Array.isArray(detail)) {
            nums = detail.map(String);
        } else if (detail && Array.isArray(detail.nums)) {
            nums = detail.nums.map(String);
        } else if (detail && Array.isArray(detail.objects)) {
            nums = detail.objects.map(String);
        }
        if (!nums) {
            return;
        }
        const allowed = new Set(nums);
        const remaining: string[] = [];

        this.enemies.forEach(id => {
            if (allowed.has(id)) {
                this.missingEnemyCounts.delete(id);
                remaining.push(id);
                return;
            }

            const misses = (this.missingEnemyCounts.get(id) ?? 0) + 1;
            if (misses >= 2) {
                this.missingEnemyCounts.delete(id);
                return;
            }

            this.missingEnemyCounts.set(id, misses);
            remaining.push(id);
        });

        this.enemies = remaining;
        if (previousQueue !== this.enemies.join(",")) {
            this.notifyAttackQueueChange();
        }
    }

    private handleRoomInfo(detail: any) {
        const signature = typeof detail === 'object' && detail !== null
            ? String(detail?.num ?? detail?.id ?? detail?.hash ?? JSON.stringify(detail))
            : String(detail ?? '');
        if (this.currentLocationSignature !== signature) {
            this.currentLocationSignature = signature;
            this.clearEnemyQueue();
        }
    }

    private checkTeam(obj: AccumulatedObjectData, id: string) {
        if (!obj || !obj.team) {
            return;
        }
        const name = this.accumulatedObjectsData[id].desc;
        if (!name) {
            return;
        }

        this.addMember(name);
        this.checkTeamLeader(obj, id);
    }

    private checkTeamLeader(obj: AccumulatedObjectData, id: string) {
        if (obj.team_leader) {
            const changed = this.leaderId !== id;
            this.leader = obj.desc;
            this.leaderId = id;
            if (changed) {
                this.client.sendEvent('teamChange');
            }
        }

        if (id === this.playerNum && obj.team === false) {
            this.leader = undefined;
            this.leaderId = undefined;
            this.joined = false;
            this.client.sendEvent('teamChange');
        }
    }

    private registerTriggers() {
        const triggers = this.client.Triggers;
        const tag = this.tag;
        triggers.registerTrigger(/^Zmuszasz \[?([A-Za-z][a-z ]+?)]? do opuszczenia druzyny\.$/, (_r, _l, m): undefined => {
            this.removeMember(m[1]);
        }, tag);
        triggers.registerTrigger(/^\[?([A-Z][a-z ]+?)]? porzuca twoja druzyne\.$/, (_r, _l, m): undefined => {
            this.removeMember(m[1]);
        }, tag);
        const clear = (): undefined => {
            this.clearTeam();
        };
        triggers.registerTrigger(/^\[?([A-Z][a-z ]+?)]? zmusza cie do opuszczenia druzyny\.$/, clear, tag);
        triggers.registerTrigger("Nie jestes w zadnej druzynie.", clear, tag);
        triggers.registerTrigger(/^\[?([A-Z][a-z ]+?)]? rozwiazuje druzyne\.$/, clear, tag);
        triggers.registerTrigger(/^Porzucasz (?:swoja druzyne|druzyne, ktorej przewodzil[ea]s)\.$/, clear, tag);
        triggers.registerTrigger(/^Przewodzisz druzynie, w ktorej oprocz ciebie (?:jest|sa) jeszcze(?::|) (?<team>.*)\.$/, (_r, _l, m): undefined => {
            this.clearTeam();
            const list = m.groups?.team ?? '';
            this.parseNames(list).forEach(n => this.addMember(n));
        }, tag);
        triggers.registerTrigger(/^Druzyne prowadzi (?<leader>.+?)(?:, zas ty jestes jej jedynym czlonkiem| i oprocz ciebie (?:jest|sa) w niej jeszcze:? (?<team>.*))\.$/, (_r, _l, m): undefined => {
            this.clearTeam();
            const leader = m.groups?.leader?.trim();
            if (leader) {
                this.leader = leader;
                this.addMember(leader);
            }
            const list = m.groups?.team;
            if (list) {
                this.parseNames(list).forEach(n => this.addMember(n));
            }
        }, tag);
        triggers.registerTrigger(/^Dolaczasz do druzyny/, (): undefined => {
            this.joined = true;
            this.client.sendGMCP("objects.nums")
            this.client.sendGMCP("objects.data")
            this.client.sendEvent('teamChange');
        })
    }

    private parseNames(list: string): string[] {
        return list.split(/,| i /).map(s => s.trim()).filter(Boolean);
    }

    private addMember(name: string) {
        const size = this.members.size;
        this.members.add(name);
        this.joined = true;
        if (this.members.size !== size) {
            this.client.sendEvent('teamChange');
        }
    }

    private removeMember(name: string) {
        const hadMember = this.members.delete(name);
        if (this.leader === name) {
            this.leader = undefined;
        }
        if (hadMember || this.leader === undefined) {
            this.client.sendEvent('teamChange');
        }
        if (this.members.size === 0) {
            this.joined = false;
        }
    }

    getTeamMembers(): string[] {
        return Array.from(this.members);
    }

    isInTeam(name: string): boolean {
        return this.members.has(name);
    }

    isInAnyTeam(): boolean {
        return this.joined || this.members.size > 0 || this.leader !== undefined;
    }

    getLeader(): string | undefined {
        return this.leader;
    }

    getLeaderId(): string | undefined {
        return this.leaderId;
    }

    isLeader(): boolean {
        return this.leaderId !== undefined && this.leaderId === this.playerNum;
    }

    clearTeam() {
        const hadMembers = this.members.size > 0 || this.leader !== undefined;
        this.members.clear();
        this.leader = undefined;
        this.joined = false;
        if (hadMembers) {
            this.client.sendEvent('teamChange');
        }
        this.clearEnemyQueue();
    }

    getAccumulatedObjectsData() {
        return this.accumulatedObjectsData
    }

    getAttackTargetId() {
        return this.attackTargetId;
    }

    getDefenseTargetId() {
        return this.defenseTargetId;
    }

    getAvatarAttackTargetId() {
        return this.avatarAttackTargetId;
    }

    addEnemyToQueue(id: string): boolean {
        const normalized = String(id);
        if (!normalized) {
            return false;
        }
        if (this.enemies.includes(normalized)) {
            return false;
        }
        this.enemies.push(normalized);
        this.missingEnemyCounts.delete(normalized);
        this.notifyAttackQueueChange();
        return true;
    }

    removeEnemyFromQueue(id: string): boolean {
        const normalized = String(id);
        const index = this.enemies.indexOf(normalized);
        if (index === -1) {
            return false;
        }
        const wasFirst = index === 0;
        this.enemies.splice(index, 1);
        this.missingEnemyCounts.delete(normalized);
        if (wasFirst) {
            const nextId = this.enemies[0];
            if (nextId) {
                const description = this.accumulatedObjectsData[nextId]?.desc;
                const displayName = description ?? `ob_${nextId}`;
                this.client.println(
                    `<span style="color:orange">/nn zeby zaatakowac nastepny cel: ${displayName}</span>`
                );
            }
        }
        this.notifyAttackQueueChange();
        return true;
    }

    shiftEnemyFromQueue(): string | undefined {
        const next = this.enemies.shift();
        if (next) {
            this.missingEnemyCounts.delete(next);
            this.notifyAttackQueueChange();
        }
        return next;
    }

    getEnemyQueue(): string[] {
        return [...this.enemies];
    }

    private clearEnemyQueue() {
        if (this.enemies.length === 0 && this.missingEnemyCounts.size === 0) {
            return;
        }
        this.enemies = [];
        this.missingEnemyCounts.clear();
        this.notifyAttackQueueChange();
    }

    private notifyAttackQueueChange() {
        if (typeof this.client?.sendEvent === "function") {
            this.client.sendEvent("attackQueueChange", this.getEnemyQueue());
        }
    }
}
