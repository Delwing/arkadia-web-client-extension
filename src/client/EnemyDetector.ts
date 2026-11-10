import type Client from "./Client";
import { subscribeMerged, refresh as refreshPeopleStore } from '@modules/data/peopleLoader';
import type { PersonListEntry } from './types/people';
import { characterStorage } from '@modules/core/storage';
import { defaultSettings } from '@modules/core/defaultSettings';
import type { EnemySeenPayload, SeenEnemy } from '@shared/events/clientEvents.ts';

/** `secondsAway` for an enemy not seen before in this session. */
export const NEVER_SEEN_SECONDS = 999999;

/**
 * Who counts as an enemy, in one place: a person from the people list marked
 * as an enemy, or of a guild in the "enemyGuilds" setting, found by their
 * description or name. The enemy binds look objects up here, and the same
 * lookup drives `enemy.seen`.
 *
 * `enemy.seen` fires once per update when enemies come into view - they were
 * not among the location's objects before and are now - with all of them in
 * one payload. It carries how long they were out of sight so a trigger can
 * skip the ones that only stepped into the next room (a chase) with a
 * condition such as `secondsAway >= 60`, instead of the client deciding.
 */
export class EnemyDetector {
    private people: PersonListEntry[] = [];
    private enemyGuilds: string[] = [];
    /** Lowercased description and name -> enemy. Rebuilt when either input changes. */
    private index = new Map<string, PersonListEntry>();
    /** Names of the enemies on the location now. */
    private present = new Set<string>();
    /** Name -> when they were last on the location (ms). */
    private lastSeen = new Map<string, number>();
    private scheduled = false;

    constructor(private client: Client, private now: () => number = () => Date.now()) {
        subscribeMerged(snapshot => {
            this.people = snapshot ?? [];
            this.rebuild();
        });
        refreshPeopleStore().catch(error => {
            console.warn('Failed to load people database', error);
        });

        const applySettings = (settings: any) => {
            const detail = (settings ?? defaultSettings) as { enemyGuilds?: unknown };
            if (Array.isArray(detail.enemyGuilds)) {
                this.enemyGuilds = detail.enemyGuilds.filter(g => typeof g === 'string') as string[];
                this.rebuild();
            }
        };
        applySettings(characterStorage.get('settings'));
        characterStorage.onChange('settings', applySettings);

        // Room changes send the object numbers and their data as separate
        // messages; one check after both keeps a group arriving as one event.
        const schedule = () => {
            if (this.scheduled) return;
            this.scheduled = true;
            queueMicrotask(() => {
                this.scheduled = false;
                this.check();
            });
        };
        client.on('parsedNums', schedule);
        client.on('parsedObjects', schedule);
        client.on('client.disconnect', () => {
            const at = this.now();
            this.present.forEach(name => this.lastSeen.set(name, at));
            this.present.clear();
        });
    }

    private rebuild() {
        const index = new Map<string, PersonListEntry>();
        const guilds = new Set(this.enemyGuilds);
        for (const person of this.people) {
            if (!person.isEnemy && !guilds.has(person.guild)) continue;
            if (person.description) index.set(person.description.toLowerCase(), person);
            if (person.name) index.set(person.name.toLowerCase(), person);
        }
        this.index = index;
    }

    /** The enemy an object description (or name) belongs to, if any. */
    match(desc: string | undefined): PersonListEntry | undefined {
        return desc ? this.index.get(desc.toLowerCase()) : undefined;
    }

    isEnemy(desc: string | undefined): boolean {
        return this.match(desc) !== undefined;
    }

    private check() {
        const at = this.now();
        const current = new Map<string, { num: number; desc: string; person: PersonListEntry }>();
        for (const obj of this.client.ObjectManager.getObjectsOnLocation()) {
            if (obj.__category === 'player' || !obj.desc) continue;
            const person = this.match(obj.desc);
            if (person && !current.has(person.name)) current.set(person.name, { num: obj.num, desc: obj.desc, person });
        }

        const arrived: SeenEnemy[] = [];
        current.forEach(({ num, desc, person }, name) => {
            if (this.present.has(name)) return;
            const last = this.lastSeen.get(name);
            arrived.push({
                num,
                desc,
                name: person.name,
                guild: person.guild,
                secondsAway: last === undefined ? NEVER_SEEN_SECONDS : Math.floor((at - last) / 1000),
                firstTime: last === undefined,
            });
        });

        this.present.forEach(name => {
            if (!current.has(name)) this.lastSeen.set(name, at);
        });
        current.forEach((_, name) => this.lastSeen.set(name, at));
        this.present = new Set(current.keys());

        if (arrived.length === 0) return;
        const payload: EnemySeenPayload = {
            enemies: arrived,
            names: arrived.map(e => e.name).join(', '),
            count: arrived.length,
            secondsAway: Math.max(...arrived.map(e => e.secondsAway)),
            firstTime: arrived.some(e => e.firstTime),
        };
        this.client.sendEvent('enemy.seen', payload);
    }
}

const detectors = new WeakMap<object, EnemyDetector>();

/** The client's one detector, created on first use. */
export function getEnemyDetector(client: Client): EnemyDetector {
    let detector = detectors.get(client);
    if (!detector) {
        detector = new EnemyDetector(client);
        detectors.set(client, detector);
    }
    return detector;
}
