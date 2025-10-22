import Client from "../Client";

export function initSpecialLocations(client: Client) {

    const locateOnNext = [
        "Schodzisz z pokladu na lad po szerokim trapie.",
        "Mozesz opuscic oboz, udajac sie do jego wyjscia. W polnocnej, poludniowo-wschodniej i poludniowo-zachodniej czesci placu dostrzegasz wejscia do namiotow."

    ]

    client.Triggers.registerTrigger(locateOnNext, (): undefined => {
        client.Map.refreshPosition = true
    })

}