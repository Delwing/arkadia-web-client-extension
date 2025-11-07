import Client from "@client/Client.ts";

const bodyLessTypes = [
    'licz',
    'wicht',
    'duch',
    'zjawa',
    'upior',
    'duszyca',
    'szkielet',
    'zywiolak',
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

    client.on('enterLocation', () => {
        killsOnLocation = false;
    });

    client.on('parsedObjects', () => {
        enemiesOnLocation = client.ObjectManager.hasEnemiesOnLocation();
    });

    client.on("parsedNums", ({ nums: currentNums }) => {
        diff = nums.filter(item => !currentNums.includes(item));
        nums = currentNums;
        if (justKilled) {
            const id = diff[0];
            const desc = client.TeamManager.getAccumulatedObjectsData()[id];

            client.emit("enemyKilled", { objNum: id, killer: justKilled, hasBody: !isBodiless(desc.desc) });
            if (diff.length > 1) {
                console.log("DIFF handling not perfect");
            }
            killsOnLocation = true;
            justKilled = undefined;
        }
        if (killsOnLocation && enemiesOnLocation && !client.ObjectManager.hasEnemiesOnLocation()) {
            client.emit('allEnemiesKilled');
        }
    });

    client.on('kill', (event) => {
        justKilled = event.killer;
    });


}
