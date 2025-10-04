import Client from "../Client";
import {loadPeople, type PersonEntry} from '../peopleLoader';

export default function initInvite(client: Client) {
    const tag = "invite";
    let enemyGuilds: string[] = [];
    let peopleCache: PersonEntry[] = [];
    let loadPromise: Promise<PersonEntry[]> | null = null;

    function ensurePeopleLoaded() {
        if (!loadPromise) {
            loadPromise = loadPeople()
                .then(people => {
                    peopleCache = people;
                    return people;
                })
                .catch(error => {
                    console.warn('Failed to load people database', error);
                    peopleCache = [];
                    return [] as PersonEntry[];
                })
                .finally(() => {
                    loadPromise = null;
                });
        }
        return loadPromise;
    }

    ensurePeopleLoaded().catch(() => undefined);

    // Function to find a person's guild by their name
    function findPersonGuild(name: string): string | null {
        const person = peopleCache.find(p => p.name === name);
        return person ? person.guild : null;
    }

    // Function to check if person is in enemy guild
    function isInEnemyGuild(name: string): boolean {
        if (enemyGuilds.length === 0) {
            return false; // If no enemy guilds selected, allow all invites
        }
        const guild = findPersonGuild(name);
        return guild ? enemyGuilds.includes(guild) : false; // If guild not found, allow invite
    }

    // Function to find object ID for a person by their name
    function findObjectIdByName(name: string): string | null {
        const accumulatedData = client.TeamManager.getAccumulatedObjectsData();
        for (const [objId, obj] of Object.entries(accumulatedData)) {
            if (obj && typeof obj === 'object' && 'desc' in obj && obj.desc === name) {
                return objId;
            }
        }
        return null;
    }

    // Listen for settings updates to get enemy guilds list
    client.addEventListener('settings', (event: CustomEvent) => {
        const settings = event.detail;
        if (Array.isArray(settings.enemyGuilds)) {
            enemyGuilds = [...settings.enemyGuilds];
        }
        ensurePeopleLoaded().catch(() => undefined);
    });

    // Register trigger for invite pattern
    // Pattern: ^\[?([A-Z][a-z ]+?)\]? zaprasza cie do swojej druzyny\.$
    const invitePattern = /^\[?([A-Z][a-z ]+?)\]? zaprasza cie do swojej druzyny\.$/;

    client.Triggers.registerTrigger(invitePattern, (rawLine, _line, matches): string | undefined => {
        const inviterName = matches[1];

        if (isInEnemyGuild(inviterName)) {
            // If inviter is in enemy guild, block the invite
            return ""; // Return empty string to hide the original message
        } else {
            const objId = findObjectIdByName(inviterName);
            if (objId) {
                client.FunctionalBind.set(`Przyjmij zaproszenie od ${inviterName}`, () => {
                    // First command: leave current team
                    client.sendCommand("porzuc druzyne");
                    client.sendCommand(`dolacz do ob_${objId}`);
                });
            }

            // Show the original message
            return rawLine;
        }
    }, tag);
}
