import Client from "../Client";

export function emitFakeLine(client: Client, line: string, type = 'combat.avatar') {
    const processed = client.onLine(line, type)
    processed.forEach(parsed => {
        client.clientAdapter.output(parsed, type)
        client.clientAdapter.emit('output-sent', 1)
    })
}
