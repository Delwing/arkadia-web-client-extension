import type Client from "./Client";
import { isDirection } from "@shared/map/directions";
import type { CommandOptions } from "./scripts/commandPreserveCaseMode";

/**
 * The only single-word special exits in the published map that are imperatives rather than places.
 * Everything multi-word is already excluded by the space rule, so this list stays short.
 */
const VERB_EXITS = new Set(['zanurkuj', 'wyskocz', 'wyplyn', 'zawroc']);

/**
 * Whether a movement command can carry a move-mode prefix.
 *
 * Special exits come in two shapes in the map data: places you move onto ("latarnia", "wyjscie",
 * "schody") and commands that move you ("wejdz na gore", "zanurkuj"). Only the first kind takes a
 * prefix — "jedz na wejdz na gore" is not a command.
 *
 * A space is the reliable tell: of the 262 multi-word special exits in the published map every
 * one is a command, while of the 138 single-word ones only the four above are. Compass directions
 * never contain a space ("polnocny-wschod" is hyphenated), so they are unaffected. The plain-word
 * test also drops the three exits that are not commands at all — two Mudlet `script:send(...)`
 * bodies and one recorded as a bare room number.
 */
function canTakeMovePrefix(cmd: string): boolean {
    const trimmed = cmd.trim();
    if (!/^[a-z][a-z-]*$/i.test(trimmed)) return false;
    return !VERB_EXITS.has(trimmed.toLowerCase());
}

export default class MovementManager {
    moveMode = 0;
    carriageMode = false;
    /** Command that halts the carriage currently being driven, or null when it is not rolling. */
    carriageStopCommand: string | null = null;
    preWalkCommands: string[] = [];
    postWalkCommands: string[] = [];

    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    sendMovement(command: string, echo: boolean, options?: CommandOptions) {
        let direction: string;
        let movePrefix = '';

        if (command.startsWith('przemknij z druzyna ')) {
            direction = command.substring(20);
            movePrefix = 'przemknij z druzyna ';
        } else if (command.startsWith('przemknij ')) {
            direction = command.substring(10);
            movePrefix = 'przemknij ';
        } else {
            direction = command;
        }

        const isOriginalDirection = isDirection(direction);

        if (this.carriageMode && isOriginalDirection) {
            // A ride is asynchronous, so the mapper must not advance here — GMCP is the authority
            // while driving. The direction still needs resolving though: a room whose westward exit
            // is recorded as "nw", or as a special-exit command, would otherwise get a literal
            // "jedz na w" the game rejects.
            const resolved = this.client.Map.resolveDirection(direction);
            // Resolution can land on a special exit ("latarnia"), which still takes the prefix —
            // "jedz na latarnia" — exactly as the on-foot path prefixes one once the map has
            // confirmed the move.
            const commandToSend = this.applyMoveModePrefix(resolved);
            if (echo && this.client.clientAdapter.shouldEchoCommand()) {
                this.client.echoCommand(commandToSend);
            }
            this.client.clientAdapter.send(commandToSend, false, options);
            return;
        }

        const moveRes = this.client.Map.move(direction);
        if (moveRes.suppress) {
            return;
        }
        if (moveRes.moved) {
            this.client.Map.setBlockable(true);
        }

        if (isOriginalDirection || moveRes.moved) {
            for (const cmd of this.preWalkCommands) {
                this.client.sendCommand(cmd, echo, options);
            }
        }

        let commandToSend: string;
        if (movePrefix) {
            commandToSend = movePrefix + moveRes.direction;
        } else if (moveRes.moved) {
            commandToSend = this.applyMoveModePrefix(moveRes.direction);
        } else {
            commandToSend = this.applyMoveMode(moveRes.direction);
        }
        if (echo && this.client.clientAdapter.shouldEchoCommand()) {
            this.client.echoCommand(commandToSend);
        }
        this.client.clientAdapter.send(commandToSend, false, options);

        if (isOriginalDirection || moveRes.moved) {
            for (const cmd of this.postWalkCommands) {
                this.client.sendCommand(cmd, echo, options);
            }
        }
    }

    applyMoveMode(cmd: string): string {
        if (!isDirection(cmd)) return cmd;
        return this.applyMoveModePrefix(cmd);
    }

    /** Prefix a movement command with the active move mode, when the command can take one. */
    applyMoveModePrefix(cmd: string): string {
        if (!canTakeMovePrefix(cmd)) return cmd;
        if (this.carriageMode) return `jedz na ${cmd}`;
        if (this.moveMode === 1) return `przemknij ${cmd}`;
        if (this.moveMode === 2) return `przemknij z druzyna ${cmd}`;
        return cmd;
    }
}
