import Client from "@client/Client.ts";
import { setLootPopupMode, getRoomContents } from "@client/scripts/lootParser.ts";

const bodyLessTypes = [
    'licz',
    'wicht',
    'duch',
    'zjawa',
    'upior',
    'duszyca',
    'szkielet',
    'kosciotrup',
    'zywiolak',
    'zywiolak ziemi',
    'zywiolak ognia',
    'zywiolak wody',
    'zywiolak powietrza',
    'szkielet trolla',
    'szkielet smoka',
    'zmora'
]

// Descs lead with adjectives ("wielki ognisty zywiolak ognia"), so the type is looked up
// as a run of whole words anywhere in the desc rather than at its start.
export function isBodiless(desc: string) {
    const words = ` ${desc.toLowerCase().trim().split(/\s+/).join(' ')} `
    return bodyLessTypes.some(type => words.includes(` ${type} `))
}


// How long a removal from objects.nums and a kill line wait for each other.
export const UNCLAIMED_REMOVAL_MS = 1000;

type Killer = "ME" | "TEAM" | "OTHER";

// Kept while the character cannot see (no light, blindness): objects.nums then
// shows nobody, so kill lines are collected and matched with whoever is missing
// once the room is visible again.
interface Blind {
    before: number[];
    killers: Killer[];
}

export default function initKillTracker(client: Client) {

    let nums: number[] = []
    let justKilled: undefined | Killer;
    let justKilledTimer: ReturnType<typeof setTimeout> | undefined;
    let enemiesOnLocation = false;
    let killsOnLocation = false;
    let bodyCount = 0;
    // The server may drop a dead mob from objects.nums before sending the kill line.
    // Such removals are held here for the kill line to claim; until it does (or the
    // wait runs out) the room cannot count as cleared.
    let unclaimed: number[] = [];
    let unclaimedTimer: ReturnType<typeof setTimeout> | undefined;
    let blind: Blind | undefined;
    // Everything that fought on this location, so a kill made blind is pinned on
    // an enemy rather than on a teammate who walked out meanwhile.
    const seenEnemies = new Set<number>();

    const clearUnclaimed = () => {
        unclaimed = [];
        clearTimeout(unclaimedTimer);
        unclaimedTimer = undefined;
    };

    const clearJustKilled = () => {
        justKilled = undefined;
        clearTimeout(justKilledTimer);
        justKilledTimer = undefined;
    };

    const noteEnemies = () => {
        client.ObjectManager.getObjectsOnLocation()
            .filter(o => o.__category === 'rest')
            .forEach(o => seenEnemies.add(o.num));
    };

    const recordKill = (id: number, killer: Killer) => {
        const desc = client.TeamManager.getAccumulatedObjectsData().get(id);
        const hasBody = desc ? !isBodiless(desc.desc) : true;
        client.emit("enemyKilled", { objNum: id, killer, hasBody, enemyDesc: desc?.desc });
        if (hasBody) {
            bodyCount++;
        }
        killsOnLocation = true;
        enemiesOnLocation = true;
    };

    const checkAllKilled = () => {
        if (unclaimed.length > 0 || blind) {
            return;
        }
        if (killsOnLocation && enemiesOnLocation && !client.ObjectManager.hasEnemiesOnLocation()) {
            client.emit('allEnemiesKilled');
        }
    };

    const onKill = (killer: Killer) => {
        if (blind) {
            blind.killers.push(killer);
            return;
        }
        if (unclaimed.length > 0) {
            const ids = unclaimed;
            clearUnclaimed();
            ids.forEach(id => recordKill(id, killer));
            checkAllKilled();
            return;
        }
        // A kill line may come with no removal at all; it must not linger and be
        // pinned on whoever leaves the room next.
        clearJustKilled();
        justKilled = killer;
        justKilledTimer = setTimeout(clearJustKilled, UNCLAIMED_REMOVAL_MS);
    };

    // objects.nums empties before objects.data says the light is gone, so what
    // vanished a moment ago still belongs to the room as it was.
    const loseSight = () => {
        blind = {
            before: [...nums, ...unclaimed],
            killers: justKilled ? [justKilled] : [],
        };
        clearUnclaimed();
        clearJustKilled();
    };

    const regainSight = () => {
        if (!blind) return;
        const { before, killers } = blind;
        blind = undefined;
        const gone = before
            .filter(id => !nums.includes(id))
            .sort((a, b) => Number(seenEnemies.has(b)) - Number(seenEnemies.has(a)));
        gone.slice(0, killers.length).forEach((id, i) => recordKill(id, killers[i]));
        checkAllKilled();
    };

    client.on('enterLocation', () => {
        killsOnLocation = false;
        bodyCount = 0;
        clearUnclaimed();
        clearJustKilled();
        blind = undefined;
        seenEnemies.clear();
    });

    client.on('parsedObjects', () => {
        enemiesOnLocation = client.ObjectManager.hasEnemiesOnLocation();
        noteEnemies();
    });

    // Only the character's own object carries can_see_in_room.
    client.on('gmcp.objects.data', (detail) => {
        const canSee = Object.values(detail ?? {})
            .map((data: any) => data?.can_see_in_room)
            .find(value => typeof value === 'boolean');
        if (canSee === false && !blind) {
            loseSight();
        } else if (canSee === true) {
            regainSight();
        }
    });

    client.on("parsedNums", ({ nums: currentNums }) => {
        const diff = nums.filter(item => !currentNums.includes(item));
        nums = currentNums;
        noteEnemies();
        if (blind) {
            return;
        }
        if (diff.length > 0) {
            if (justKilled) {
                const killer = justKilled;
                clearJustKilled();
                diff.forEach(id => recordKill(id, killer));
            } else {
                unclaimed.push(...diff);
                clearTimeout(unclaimedTimer);
                unclaimedTimer = setTimeout(() => {
                    clearUnclaimed();
                    checkAllKilled();
                }, UNCLAIMED_REMOVAL_MS);
            }
        }
        checkAllKilled();
    });

    client.on('kill', (event) => onKill(event.killer));

    client.aliases.push({
        pattern: /^\/loot$/,
        callback: () => {
            const rc = getRoomContents();
            const totalBodies = Math.max(bodyCount, rc.bodies + rc.sterta);
            if (totalBodies === 0 && rc.groundItems.length === 0) {
                client.print('Brak cial do przeszukania.');
                return;
            }
            setLootPopupMode(true);
            for (let i = 1; i <= totalBodies; i++) {
                client.sendCommand(`ob ${i}. cialo`);
            }
            if (rc.groundItems.length > 0) {
                client.sendEvent('loot.ground.open', { items: rc.groundItems });
            }
        },
    });
}
