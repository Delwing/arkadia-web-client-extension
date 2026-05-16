import type Client from "./Client";
import { isDirection } from "@shared/map/directions";
import type { CommandOptions } from "./scripts/commandPreserveCaseMode";

export default class MovementManager {
    moveMode = 0;
    carriageMode = false;
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
            const commandToSend = this.applyMoveModePrefix(direction);
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

    applyMoveModePrefix(cmd: string): string {
        if (this.carriageMode) return `jedz na ${cmd}`;
        if (this.moveMode === 1) return `przemknij ${cmd}`;
        if (this.moveMode === 2) return `przemknij z druzyna ${cmd}`;
        return cmd;
    }
}
