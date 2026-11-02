import type { RemoteObject } from "@modules/remoteControl/protocol.ts";

/** Commands aim at `ob_<num>`, as the PC's own object list does. */
export function attackCommandFor(object: RemoteObject, attackCommand: string): string {
    return `${attackCommand} ob_${object.num}`;
}

/** A teammate is covered; anyone else is stood in front of. */
export function coverCommandFor(object: RemoteObject): string {
    return object.team ? `zaslon ob_${object.num}` : `zaslon przed ob_${object.num}`;
}
