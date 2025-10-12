import type { LetterSubmitPayload } from "../types/letter";

export interface ClientKnownEvents {
    command: string;
    "port-connected": void;
    "output-sent": number;
    "buffer-sent": number;
    mapMove: void;
    stepBack: void;
    leadTo: number;
    notify: { text: string };
    lampTimer: number | null;
    coverTimer: number | null;
    breakItem: { text: string; command?: string };
    packageStatus: { recipient: string; seconds?: number } | null;
    releaseGuard: boolean;
    attackMode: string;
    contentWidth: number;
    enterLocation: { id: number; room: any };
    highlights: number[];
    multibinds: { list: { index: number; action: string; label: string }[] };
    letterComposer: { open: boolean };
    "letterComposer.submit": LetterSubmitPayload;
    "letterComposer.preview": LetterSubmitPayload;
    npc: any;
    zaskTimer: { seconds: number; ok: boolean } | null;
    moveModeChanged: number;
}

export type ClientEvents = ClientKnownEvents & {
    [key: `gmcp.${string}`]: unknown;
    [key: `gmcp_msg.${string}`]: string;
    [key: string]: unknown;
};
