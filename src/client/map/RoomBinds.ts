import type {MapHelperClient} from "./types";

/** One command of a room bind (`cmd#cmd*delay`), and how many seconds to wait before it. */
export type BindCommand = { command: string; delay: number | null };

export function parseBind(bindStr: string): BindCommand[] {
    const result: BindCommand[] = [];
    const parts = bindStr.split(/[#;]/);
    for (const part of parts) {
        const segments = part.split('*');
        const command = segments[0];
        if (!command) continue;
        const delay = segments.length >= 2 ? parseFloat(segments[1]) : null;
        result.push({command, delay: delay != null && !isNaN(delay) ? delay : null});
    }
    return result;
}

export function getBindPrintable(bindStr: string): string {
    const parts = bindStr.split(/[#;]/);
    return parts.map(part => part.split('*')[0]).filter(Boolean).join(';');
}

/**
 * What entering a room sets up from its `userData`: the walk pre/post commands
 * and the functional bind (`bind`, or a drink where the room is `drinkable`).
 */
export class RoomBinds {
    private pendingBindAbort?: AbortController;
    /** Room whose bind is set and not left since, so placing us there again does not print it twice. */
    private boundRoomId?: number;

    constructor(
        private readonly client: MapHelperClient,
        private readonly position: { readonly currentRoom: MapData.Room; readonly onTransport: boolean },
    ) {
    }

    executeBind(bindStr: string) {
        const commands = parseBind(bindStr);
        for (const cmd of commands) {
            if (cmd.delay != null && cmd.delay > 0) {
                setTimeout(() => this.client.sendCommand(cmd.command), cmd.delay * 1000);
            } else {
                this.client.sendCommand(cmd.command);
            }
        }
    }

    /** `stepBack`: the step that would have reached the room did not happen. */
    abortPending() {
        this.pendingBindAbort?.abort();
    }

    handleNewLocation({room}: { room: MapData.Room }) {
        if (room?.userData?.walk_pre_cmd !== undefined) {
            const val: string = room.userData.walk_pre_cmd;
            this.client.setPreWalkCommands?.(
                val === '<reset>' ? [] : val.split('#').map((s: string) => s.trim()).filter(Boolean)
            );
        }
        if (room?.userData?.walk_post_cmd !== undefined) {
            const val: string = room.userData.walk_post_cmd;
            this.client.setPostWalkCommands?.(
                val === '<reset>' ? [] : val.split('#').map((s: string) => s.trim()).filter(Boolean)
            );
        }

        const roomId = room?.id;
        // Placed again in the room we just bound (/ustaw, the GPS, a plugin localizer):
        // its bind is already up, so don't print it a second time.
        if (typeof roomId === "number" && roomId === this.boundRoomId) {
            return;
        }
        this.boundRoomId = undefined;

        // A bind still waiting for output belongs to an earlier placement - this one replaces it.
        this.pendingBindAbort?.abort();
        const abortController = new AbortController();
        this.pendingBindAbort = abortController;

        this.client.on(
            "output-sent",
            () => {
                if (abortController.signal.aborted) {
                    return;
                }
                this.pendingBindAbort = undefined;
                if (typeof roomId === "number" && this.position.currentRoom?.id !== roomId) {
                    return;
                }
                if (room?.userData?.bind) {
                    const bindStr = room.userData.bind;
                    const printable = getBindPrintable(bindStr);
                    this.client.functionalBind?.set(
                        printable,
                        () => this.executeBind(bindStr)
                    );
                    this.boundRoomId = roomId;
                } else if (room?.userData?.drinkable && !this.position.onTransport && this.client.shouldSetDrinkableBind?.() !== false) {
                    this.client.functionalBind?.set(
                        "napij sie do syta wody",
                        () => this.client.sendCommand("napij sie do syta wody")
                    );
                    this.boundRoomId = roomId;
                }
            },
            {once: true, signal: abortController.signal}
        );
    }
}
