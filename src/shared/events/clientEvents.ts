import type {CommandOptions} from "../../../client/src/scripts/commandPreserveCaseMode";
import type {LetterSubmitPayload} from "../../../client/src/types/letter";
import type {TransportTimerPayload} from "../../../client/src/types/transport";
import type {UiSettingsEventPayload} from "../../../client/src/types/uiSettingsEvent";

export type SendCommandEvent = {
    command: string;
    echo?: boolean;
    options?: CommandOptions;
};

type NotificationPayload = {
    text: string;
    time?: number;
};

type StorageEventPayload = {
    key: string;
    value: unknown;
};

type MultibindList = {
    list: { index: number; action: string; label: string }[];
};

type MessageEventPayload = [text: string, type?: string, timestamp?: number];

type RecordingAutoStopPayload = [name: string | null, save?: boolean];

type PlaybackIndexPayload = [current: number, total: number];

export type KnowledgeReportAction =
    | { type: "completeLibrary"; libraryId: string }
    | { type: "resetLibrary"; libraryId: string };

export type PackageStatus = {
    recipient: string;
    seconds?: number
}

export interface KnownEvents {
    "command": string;
    "port-connected": void;
    "output-sent": number;
    "buffer-sent": number;
    "mapMove": void;
    "stepBack": void;
    "leadTo": number;
    "clearLeadTo": void;
    "notify": NotificationPayload;
    "lampTimer": number | null;
    "coverTimer": number | null;
    "breakItem": { text: string; command?: string } | null;
    "packageStatus": PackageStatus | null;
    "releaseGuard": boolean;
    "attackMode": "A" | "AW" | "AWR";
    "contentWidth": number;
    "enterLocation": { id: number; room: unknown };
    "highlights": number[];
    "multibinds": MultibindList;
    "letterComposer": { open: boolean };
    "letterComposer.submit": LetterSubmitPayload;
    "letterComposer.preview": LetterSubmitPayload;
    "npc": unknown;
    "zaskTimer": { seconds: number; ok: boolean } | null;
    "moveModeChanged": number;
    "ping": number | null;
    "transportTimer": TransportTimerPayload | null;
    "combatTimer": number | null;
    "teamLeaderTargetNoAvatar": string;
    "teamLeaderTargetAvatar": void;
    "teamChange": void;
    "isTeamLeader": boolean;
    "reset": void;
    "refreshPositionWhenAble": void;
    "knowledgeReport": unknown | null;
    "knowledgeDetailsReport": unknown | null;
    "knowledgeReportAction": KnowledgeReportAction;
    "sendCommand": SendCommandEvent;
    "requestHerbCounts": void;
    "herbManagerClose": void;
    "herbCounts": unknown;
    "herbManagerOpen": void;
    "sound:play": { key: string };
    "playBeep": void;
    "line-start": void;
    "storage": StorageEventPayload;
    "settings": unknown;
    "binds": unknown;
    "uiSettings": UiSettingsEventPayload | null | undefined;
    "mobileButtonsSettings": unknown;
    "pauserStart": void;
    "pauserEnd": void;
    "client.connect": void;
    "client.disconnect": void;
    "open": Event;
    "close": CloseEvent;
    "error": unknown;
    "gmcp": { path: string; value: unknown };
    "line-sent": void;
    "recording.start": string;
    "recording.stop": boolean | undefined;
    "recording.auto.start": string | null | undefined;
    "recording.auto.stop": RecordingAutoStopPayload;
    "playback.stop": void;
    "playback.pause": void;
    "playback.resume": void;
    "playback.start": number | undefined;
    "playback.speed": number;
    "playback.index": PlaybackIndexPayload;
    "message": MessageEventPayload;
    "attackQueueChange": string[];
    "parsedObjects": void;
    "parsedNums": { nums: number[] };
    "kill": { killer: "ME" | "TEAM" | "OTHER" };
    "enemyKilled": { objNum: number; killer: "ME" | "TEAM" | "OTHER"; hasBody?: boolean };
    "allEnemiesKilled": void;
}

export type ClientEvents = KnownEvents & {
    [key: `gmcp.${string}`]: unknown;
    [key: `gmcp_msg.${string}`]: string;
};
