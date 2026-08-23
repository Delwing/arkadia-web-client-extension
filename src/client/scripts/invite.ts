import Client from "../Client";
import { gmcp } from "../gmcp";
import { subscribeMerged, refresh as refreshPeopleStore } from '@modules/data/peopleLoader';
import type { PersonListEntry } from '../types/people';
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";

export default function initInvite(client: Client) {
    const tag = "invite";
    let enemyGuilds: string[] = [];
    let peopleCache: PersonListEntry[] = [];

    subscribeMerged(snapshot => {
        peopleCache = snapshot ?? [];
    });

    function ensurePeopleLoaded() {
        return refreshPeopleStore().catch(error => {
            console.warn('Failed to load people database', error);
            return undefined;
        });
    }

    ensurePeopleLoaded().catch(() => undefined);

    function isEnemy(name: string): boolean {
        const person = peopleCache.find(p => p.name === name);
        if (!person) return false;
        if (person.isAlly) return false;
        if (person.isEnemy) return true;
        return enemyGuilds.includes(person.guild);
    }

    // Function to find object ID for a person by their name
    function findObjectIdByName(name: string): number | null {
        const accumulatedData = client.TeamManager.getAccumulatedObjectsData();

        const nums = Array.isArray(gmcp?.objects?.nums)
            ? gmcp.objects.nums
            : [];

        for (let index = nums.length - 1; index >= 0; index--) {
            const objectId = nums[index];
            const obj = accumulatedData.get(objectId);
            if (obj && typeof obj === 'object' && obj.desc === name) {
                return objectId;
            }
        }

        return null;
    }

    // Listen for settings updates to get enemy guilds list
    const applySettings = (settings: any) => {
        const detail = (settings ?? defaultSettings) as { enemyGuilds?: unknown };
        if (Array.isArray(detail.enemyGuilds)) {
            enemyGuilds = [...detail.enemyGuilds];
        }
        ensurePeopleLoaded().catch(() => undefined);
    };
    applySettings(characterStorage.get('settings'));
    client.scope.onDispose(characterStorage.onChange('settings', applySettings));

    // Register trigger for invite pattern
    // Pattern: ^\[?([A-Z][a-z ]+?)\]? zaprasza cie do swojej druzyny\.$
    const invitePattern = /^\[?([A-Z][a-z ]+?)]? zaprasza cie do swojej druzyny\.$/;

    client.Triggers.registerTrigger(invitePattern, (line, matches) => {
        const inviterName = matches[1];

        if (isEnemy(inviterName)) {
            // If inviter is in enemy guild, block the invite
            return line;
        } else {
            const objId = findObjectIdByName(inviterName);
            if (objId) {
                client.FunctionalBind.set(`Przyjmij zaproszenie od ${inviterName}`, () => {
                    // First command: leave current team
                    client.sendCommand("porzuc druzyne");
                    client.sendCommand(`dolacz do ob_${objId}`);
                });
            }

            return line;
        }
    }, tag);
}
