import Client from "../Client";
import { longToShort } from "../MapHelper";

function registerTempBind(
    client: Client,
    aliases: { pattern: RegExp; callback: Function }[],
    pattern: RegExp,
    index: number,
) {
    aliases.push({
        pattern,
        callback: (matches: RegExpMatchArray) => {
            const command = matches[1] ?? '';
            client.setTempBind(index, command);
        },
    });
}

export default function initTempBinds(client: Client, aliases: { pattern: RegExp; callback: Function }[]) {
    registerTempBind(client, aliases, /^\/tbind1(?:\s+(.*))?$/, 0);
    registerTempBind(client, aliases, /^\/tbind2(?:\s+(.*))?$/, 1);

    client.Triggers.registerTrigger(/^Nie wiesz, w ktorym kierunku masz ruszyc\.\.\.$/, () => {
        const embedded = (window as any).embedded;
        const destinations = Array.isArray(embedded?.destinations) ? embedded.destinations : [];
        if (destinations.length === 0) {
            return undefined;
        }

        const currentRoom: any = client.Map?.currentRoom;
        if (!currentRoom?.id) {
            return undefined;
        }

        const destId = parseInt(String(destinations[0]), 10);
        if (Number.isNaN(destId)) {
            return undefined;
        }

        const findPath = client.Map?.findPath?.bind(client.Map);
        if (!findPath) {
            return undefined;
        }

        let path: Array<string | number> | null = null;
        try {
            path = findPath(currentRoom.id, destId) ?? null;
        } catch (e) {
            path = null;
        }

        if (!path || path.length < 2) {
            return undefined;
        }

        const nextId = parseInt(String(path[1]), 10);
        if (Number.isNaN(nextId)) {
            return undefined;
        }

        const exits = Object.assign({}, currentRoom.exits ?? {}, currentRoom.specialExits ?? {});
        const nextEntry = Object.entries(exits).find(([_, value]) => parseInt(String(value), 10) === nextId);
        if (!nextEntry) {
            return undefined;
        }

        const dir = nextEntry[0];
        const command = (longToShort as Record<string, string | undefined>)[dir] ?? dir;
        if (typeof command !== 'string' || command.trim() === '') {
            return undefined;
        }

        client.setTempBind(0, command);
        return undefined;
    }, 'tempBinds');
}
