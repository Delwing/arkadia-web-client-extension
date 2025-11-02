import Client from "@client/src/Client.ts";

export default function initKillTracker(client: Client) {

    let nums: number[] = []
    let diff: number[] = []
    let justKilled: undefined | "ME" | "TEAM" | "OTHER";
    let enemiesOnLocation = false;
    client.eventTarget.on('parsedObjects', () => {
        enemiesOnLocation = client.ObjectManager.hasEnemiesOnLocation()
    })
    client.eventTarget.on("parsedNums", (event) => {
        diff = nums.filter(item => !event.nums.includes(item))
        nums = event.nums
        if (justKilled) {
            client.eventTarget.emit("enemyKilled", {objNum: diff[0], killer: justKilled})
            if (diff.length > 1) {
                console.log("DIFF handling not perfect")
            }
            justKilled = undefined
        }
        if (enemiesOnLocation && !client.ObjectManager.hasEnemiesOnLocation()) {
            client.eventTarget.emit('allEnemiesKilled');
        }
    })

    client.eventTarget.on('kill', (event) => {
        justKilled = event.killer
    })


}