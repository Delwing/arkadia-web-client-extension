import type Client from "./Client";
import { isDirection } from "@shared/map/directions";
import { isDrivableExit } from "@shared/map/exitCommands";
import type { CommandOptions } from "./scripts/commandPreserveCaseMode";

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
        // The same question as "can a carriage use this exit" - see isDrivableExit.
        if (!isDrivableExit(cmd)) return cmd;
        if (this.carriageMode) return `jedz na ${cmd}`;
        if (this.moveMode === 1) return `przemknij ${cmd}`;
        if (this.moveMode === 2) return `przemknij z druzyna ${cmd}`;
        return cmd;
    }
}
