import {stripPolishCharacters} from "@shared/stripPolishCharacters.ts";

/** A bare look around, which the game answers with a room.info like a step. Arkadia has no `l`. */
const LOOK_COMMAND = /^(?:sp|spojrz|zerknij)$/;

/**
 * Whether a command is a bare look around (`sp`, `spojrz`/`spójrz`, `zerknij`).
 * Case, surrounding spaces and Polish letters do not matter, so it works both on
 * what the player typed (command hooks) and on what is sent (the `command` event).
 */
export function isLookCommand(command: string): boolean {
    return LOOK_COMMAND.test(stripPolishCharacters(command).trim().toLowerCase());
}
