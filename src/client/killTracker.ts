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

function isBodiless(desc: string) {
    const type = desc.split(' ').splice(0, 2).join(" ")
    return bodyLessTypes.includes(type)
}


export default function initKillTracker(client: Client) {

    let nums: number[] = []
    let diff: number[] = []
    let justKilled: undefined | "ME" | "TEAM" | "OTHER";
    let enemiesOnLocation = false;
    let killsOnLocation = false;
    let bodyCount = 0;

    client.on('enterLocation', () => {
        killsOnLocation = false;
        bodyCount = 0;
    });

    client.on('parsedObjects', () => {
        enemiesOnLocation = client.ObjectManager.hasEnemiesOnLocation();
    });

    client.on("parsedNums", ({ nums: currentNums }) => {
        diff = nums.filter(item => !currentNums.includes(item));
        nums = currentNums;
        if (justKilled && diff.length > 0) {
            for (const id of diff) {
                const desc = client.TeamManager.getAccumulatedObjectsData().get(id);
                const hasBody = desc ? !isBodiless(desc.desc) : true;
                client.emit("enemyKilled", { objNum: id, killer: justKilled, hasBody, enemyDesc: desc?.desc });
                if (hasBody) {
                    bodyCount++;
                }
            }
            killsOnLocation = true;
            enemiesOnLocation = true;
            justKilled = undefined;
        }
        if (killsOnLocation && enemiesOnLocation && !client.ObjectManager.hasEnemiesOnLocation()) {
            client.emit('allEnemiesKilled');
        }
    });

    client.on('kill', (event) => {
        justKilled = event.killer;
    });

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
