import Client from "./Client";
import type {GmcpRoomInfo} from "@shared/events";

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

export default class TeamManager {
    private client: Client;
    private members: Set<string> = new Set();
    private teamMemberDescriptions: Map<number, string> = new Map();
    private joined = false;
    private leader?: string;
    private leaderId?: number;
    private tag = 'teamManager';
    private accumulatedObjectsData = new Map<number, ObjectData>();
    playerNum?: number;
    private leaderAttackTargetId?: number;
    private avatarAttackTargetId?: number;
    private attackTargetId?: number;
    private defenseTargetId?: number;
    private enemies: number[] = [];
    private missingEnemyCounts: Map<number, number> = new Map();
    private currentLocationSignature?: string;

    constructor(client: Client) {
        this.client = client;
        this.client.on('gmcp.objects.data', detail => {
            this.handleObjectsData(detail as Map<number, ObjectData>);
        });
        this.client.on('gmcp.objects.nums', detail => {
            this.handleObjectsNums(detail);
        });
        this.client.on('gmcp.char.info', info => {
            if (info?.object_num !== undefined) {
                this.playerNum = info.object_num;
            }
        });
        this.client.on('gmcp.room.info', detail => {
            this.handleRoomInfo(detail);
        });
        if (typeof (this.client as any).Triggers?.registerTrigger === 'function') {
            this.registerTriggers();
        }
        this.registerEventListeners();
    }

    private registerEventListeners() {
        this.client.on('clearAttackQueue', () => {
            this.clearEnemyQueue();
        });
        this.client.on('addToAttackQueue', (id: number) => {
            if (id) {
                this.addEnemyToQueue(id);
            }
        });
        this.client.on('removeFromAttackQueue', (id: number) => {
            if (id) {
                this.removeEnemyFromQueue(id);
            }
        });
    }

    private handleObjectsData(data: Map<number, ObjectData>) {
        Object.entries(data).forEach(([idStr, obj]) => {
            const id = Number(idStr);
            this.accumulatedObjectsData.set(id, { ...(this.accumulatedObjectsData.get(id) ?? {}), ...obj });

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
                this.leaderAttackTargetId = typeof obj.attack_num === "boolean" ? undefined : Number(obj.attack_num);
            }
            if (id === this.playerNum && obj.attack_num !== undefined) {
                this.avatarAttackTargetId = typeof obj.attack_num === "boolean" ? undefined : Number(obj.attack_num);
            }
        });
        if (this.leaderAttackTargetId && this.avatarAttackTargetId !== this.leaderAttackTargetId) {
            this.client.sendEvent('teamLeaderTargetNoAvatar', this.leaderAttackTargetId);
        } else  {
            this.client.sendEvent('teamLeaderTargetAvatar');
        }
    }

    private handleObjectsNums(detail: any) {
        let nums: number[] | null = null;
        if (Array.isArray(detail)) {
            nums = detail
        } else if (detail && Array.isArray(detail.nums)) {
            nums = detail.nums;
        }
        if (!nums) {
            return;
        }
        const allowed = new Set(nums);

        if (this.leaderAttackTargetId && !allowed.has(this.leaderAttackTargetId)) {
            this.leaderAttackTargetId = undefined;
            this.client.sendEvent('teamLeaderTargetAvatar');
        }

        if (this.enemies.length === 0) {
            return;
        }
        const previousQueue = this.enemies.join(",");
        const remaining: number[] = [];

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

    private handleRoomInfo(detail: GmcpRoomInfo) {
        const signature = typeof detail === 'object' && detail !== null
            ? String(detail?.num ?? detail?.id ?? detail?.hash ?? JSON.stringify(detail))
            : String(detail ?? '');
        if (this.currentLocationSignature !== signature) {
            this.currentLocationSignature = signature;
            this.clearEnemyQueue();
        }
    }

    private checkTeam(obj: ObjectData, id: number) {
        if (!obj) {
            return;
        }
        const isKnownTeamMember = this.teamMemberDescriptions.has(id);
        if (obj.team === undefined && !isKnownTeamMember) {
            return;
        }

        if (obj.team === false) {
            const name = this.teamMemberDescriptions.get(id);
            if (name) {
                this.teamMemberDescriptions.delete(id);
                let stillMapped = false;
                for (const desc of this.teamMemberDescriptions.values()) {
                    if (desc === name) {
                        stillMapped = true;
                        break;
                    }
                }
                if (!stillMapped) {
                    this.members.delete(name);
                    if (this.members.size === 0) {
                        this.joined = false;
                    }
                    this.client.sendEvent('teamChange');
                }
            }
            if (this.leaderId === id) {
                this.leader = undefined;
                this.leaderId = undefined;
                this.client.sendEvent('teamChange');
            }
            return;
        }

        const name = this.accumulatedObjectsData.get(id)?.desc;
        if (!name) {
            return;
        }

        const previousName = this.teamMemberDescriptions.get(id);
        if (previousName && previousName !== name) {
            this.members.delete(previousName);
            if (this.leader === previousName) {
                this.leader = name;
                this.client.sendEvent('teamChange');
            }
        }

        this.teamMemberDescriptions.set(id, name);
        this.addMember(name);
        this.checkTeamLeader(obj, id);
    }

    private checkTeamLeader(obj: ObjectData, id: number) {
        if (obj.team_leader) {
            const changed = this.leaderId !== id;
            this.leader = obj.desc ?? this.accumulatedObjectsData.get(id)?.desc;
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

        this.client.sendEvent("isTeamLeader", this.getLeaderId() === this.playerNum);
    }

    private registerTriggers() {
        const triggers = this.client.Triggers;
        const tag = this.tag;
        triggers.registerTrigger(/^Zmuszasz \[?([A-Za-z][a-z ]+?)]? do opuszczenia druzyny\.$/, (line, matches) => {
            if (matches) this.removeMember(matches[1]);
            return line
        }, tag);
        triggers.registerTrigger(/^\[?([A-Z][a-z ]+?)]? porzuca twoja druzyne\.$/, (line, matches) => {
            if (matches) this.removeMember(matches[1]);
            return line;
        }, tag);
        const clear = (line: any) => {
            this.clearTeam();
            return line;
        };
        triggers.registerTrigger(/^\[?([A-Z][a-z ]+?)]? zmusza cie do opuszczenia druzyny\.$/, clear, tag);
        triggers.registerTrigger("Nie jestes w zadnej druzynie.", clear, tag);
        triggers.registerTrigger(/^\[?([A-Z][a-z ]+?)]? rozwiazuje druzyne\.$/, clear, tag);
        triggers.registerTrigger(/^Porzucasz (?:swoja druzyne|druzyne, ktorej przewodzil[ea]s)\.$/, clear, tag);
        triggers.registerTrigger(/^Przewodzisz druzynie, w ktorej oprocz ciebie (?:jest|sa) jeszcze(?::|) (?<team>.*)\.$/, (line, matches) => {
            if (matches?.groups?.team) {
                this.reconcileMembers(this.parseNames(matches.groups.team));
            }
            this.client.sendGMCP("objects.nums");
            this.client.sendGMCP("objects.data");
            return line;
        }, tag);
        triggers.registerTrigger(/^Druzyne prowadzi (?<leader>.+?)(?:, zas ty jestes jej jedynym czlonkiem| i oprocz ciebie (?:jest|sa) w niej jeszcze:? (?<team>.*))\.$/, (line, matches) => {
            const expectedMembers = matches?.groups?.team ? this.parseNames(matches.groups.team) : [];
            this.reconcileMembers(expectedMembers);
            this.client.sendGMCP("objects.nums");
            this.client.sendGMCP("objects.data");
            return line;
        }, tag);
        triggers.registerTrigger(/^Dolaczasz do druzyny \[?([A-Z][a-z ]+?)]?\.(?: Od teraz jej sklad stanowicie ty(?:, | i )(.+)\.)?$/, (line, matches) => {
            this.clearTeam();
            // Leader is populated from GMCP objects.data (team_leader flag)
            const teamList = matches?.[2];
            if (teamList) {
                this.parseNames(teamList).forEach(name => this.addMember(name));
            }
            this.joined = true;
            this.client.sendGMCP("objects.nums");
            this.client.sendGMCP("objects.data");
            this.client.sendEvent('teamChange');
            return line;
        }, tag)
    }

    private parseNames(list: string): string[] {
        return list.split(/,| i /).map(s => s.trim().replace(/^\[|]$/g, '')).filter(Boolean);
    }

    private reconcileMembers(expectedNames: string[]) {
        const expected = new Set(expectedNames);
        let changed = false;
        for (const name of this.members) {
            if (!expected.has(name)) {
                this.members.delete(name);
                for (const [id, desc] of this.teamMemberDescriptions.entries()) {
                    if (desc === name) {
                        this.teamMemberDescriptions.delete(id);
                        break;
                    }
                }
                changed = true;
            }
        }
        if (changed) {
            if (this.members.size === 0) {
                this.joined = false;
            }
            this.client.sendEvent('teamChange');
        }
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

        for (const [id, desc] of this.teamMemberDescriptions.entries()) {
            if (desc === name) {
                this.teamMemberDescriptions.delete(id);
                break;
            }
        }

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

    getTeamMembersOnLocation(): string[] {
        return this.client.ObjectManager.getObjectsOnLocation()
            .filter(o => o.__category === 'team' && o.desc)
            .map(o => o.desc!);
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

    getLeaderId(): number | undefined {
        return this.leaderId;
    }

    isLeader(): boolean {
        return this.leaderId !== undefined && this.leaderId === this.playerNum;
    }

    clearTeam() {
        const hadMembers = this.members.size > 0 || this.leader !== undefined;
        this.members.clear();
        this.teamMemberDescriptions.clear();
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

    getTeamMemberObjectId(name: string): number | undefined {
        const lowerName = name.toLowerCase();
        for (const [id, desc] of this.teamMemberDescriptions.entries()) {
            if (desc.toLowerCase() === lowerName) {
                return id;
            }
        }
        return undefined;
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

    addEnemyToQueue(id: number): boolean {
        if (!id) {
            return false;
        }
        if (this.enemies.includes(id)) {
            return false;
        }
        this.enemies.push(id);
        this.missingEnemyCounts.delete(id);
        this.notifyAttackQueueChange();
        return true;
    }

    removeEnemyFromQueue(id: number): boolean {
        const index = this.enemies.indexOf(id);
        if (index === -1) {
            return false;
        }
        const wasFirst = index === 0;
        this.enemies.splice(index, 1);
        this.missingEnemyCounts.delete(id);
        if (wasFirst) {
            const nextId = this.enemies[0];
            if (nextId) {
                const description = this.accumulatedObjectsData.get(Number(nextId))?.desc;
                const displayName = description ?? `ob_${nextId}`;
                this.client.println(
                    `<span style="color:orange">/nn zeby zaatakowac nastepny cel: ${displayName}</span>`
                );
            }
        }
        this.notifyAttackQueueChange();
        return true;
    }

    shiftEnemyFromQueue(): number | undefined {
        const next = this.enemies.shift();
        if (next) {
            this.missingEnemyCounts.delete(next);
            this.notifyAttackQueueChange();
        }
        return next;
    }

    peekEnemyFromQueue(): number | undefined {
        return this.enemies[0];
    }

    getEnemyQueue(): number[] {
        return [...this.enemies];
    }

    clearEnemyQueue() {
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
