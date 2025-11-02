import Client from "@client/src/Client.ts";

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
    client.eventTarget.on('enterLocation', () => {
        killsOnLocation = false;
    })
    client.eventTarget.on('parsedObjects', () => {
        enemiesOnLocation = client.ObjectManager.hasEnemiesOnLocation()
    })
    client.eventTarget.on("parsedNums", (event) => {
        diff = nums.filter(item => !event.nums.includes(item))
        nums = event.nums
        if (justKilled) {
            const id = diff[0]
            const desc = client.TeamManager.getAccumulatedObjectsData()[id]

            client.eventTarget.emit("enemyKilled", {objNum: id, killer: justKilled, hasBody: !isBodiless(desc.desc)})
            if (diff.length > 1) {
                console.log("DIFF handling not perfect")
            }
            killsOnLocation = true;
            justKilled = undefined
        }
        if (killsOnLocation && enemiesOnLocation && !client.ObjectManager.hasEnemiesOnLocation()) {
            client.eventTarget.emit('allEnemiesKilled');
        }
    })

    client.eventTarget.on('kill', (event) => {
        justKilled = event.killer
    })


}