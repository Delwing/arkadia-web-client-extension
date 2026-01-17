import {CommandOptions} from "@client/scripts/commandPreserveCaseMode.ts";
import {LetterSubmitPayload} from "@client/types/letter.ts";
import {TransportTimerPayload} from "@client/types/transport.ts";
import {UiSettingsEventPayload} from "@client/types/uiSettingsEvent.ts";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";
import {PluginInfo} from "@shared/types/Plugin.ts";
import type {RecordedEvent} from "@shared/recorder/Recorder.ts";
import type {Contract} from "@client/scripts/contracts.ts";
import type {ChatEntry} from "@client/scripts/chatHistory.ts";
import type {CombatEntry, CombatMessageType} from "@client/scripts/combatWindow.ts";
import type {MailEntry, MailType, LetterContent} from "@client/scripts/poczta.ts";

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

type MessageEventPayload = [text: string | AnsiAwareBuffer, type?: string, timestamp?: number];

type RecordingAutoStopPayload = [name: string | null, save?: boolean];

type PlaybackIndexPayload = [current: number, total: number];

type PlaybackLoopState = {
    start: number | null;
    end: number | null;
    enabled: boolean;
};

export type KnowledgeReportAction =
    | { type: "completeLibrary"; libraryId: string }
    | { type: "resetLibrary"; libraryId: string };

export type PackageStatus = {
    recipient: string;
    seconds?: number
}

type ClockUpdatePayload = {
    domain: "Empire" | "Ishtar";
    hours: number;
    minutes: number;
    precision: number;
    sunrise: number | string | "?";
    sunset: number | string | "?";
    dayLabel: string;
    dayOfMonth: number;
    dayOfYear: number;
    daylight?: boolean;
    season?: number;
}

type ClockDomainActivePayload = {
    domain: "Empire" | "Ishtar";
}

type ClockMismatchPayload = {
    domain: "Empire" | "Ishtar";
    type: "sunrise" | "sunset";
    dayOfYear: number;
    expectedHour: number;
    observedHour: number; // Corrected hour (after rounding)
    observedMinutes: number; // Always 0 after correction
    indicatedHour?: string; // Raw observed hour before correction (e.g., "4:59")
}

type ClockSunEventPayload = {
    domain: "Empire" | "Ishtar";
    dayOfYear: number;
    observedHour: number;
    observedMinutes: number;
    indicatedHour?: string; // Raw observed hour before correction (e.g., "4:59")
}

type PluginLoadedPayload = {
    url: string;
    info: PluginInfo;
};

type PluginErrorPayload = {
    url: string;
    error: string;
};

type PluginDestroyedPayload = {
    url: string;
};

export type EnemyStatusPayload = {
    name: string;
};

export interface KnownEvents {
    "enemy.paralyzed": EnemyStatusPayload;
    "enemy.paralyzed.end": EnemyStatusPayload;
    "enemy.broken_defense": EnemyStatusPayload;
    "command": string;
    "port-connected": void;
    "output-sent": number;
    "buffer-sent": number;
    "mapMove": void;
    "stepBack": void;
    "leadTo": number;
    "clearLeadTo": void;
    "mapPath": { path: number[]; color: string } | null;
    "mapHighlights": [{ roomId: number; color: string }[]];
    "mapLocationLabel": string;
    "requestMapLocationLabel": void;
    "requestMapHighlights": void;
    "notify": NotificationPayload;
    "lampTimer": number | null;
    "coverTimer": number | null;
    "breakItem": { text: string; command?: string } | null;
    "packageStatus": PackageStatus | null;
    "releaseGuard": boolean;
    "attackMode": "A" | "AW" | "AWR";
    "contentWidth": number;
    "enterLocation": { id: number; room: unknown; direction: string | null };
    "highlights": [number[]];
    "multibinds": MultibindList;
    "letterComposer": { to?: string; cc?: string; udw?: string; subject?: string; content?: string };
    "letterComposer.submit": LetterSubmitPayload;
    "letterComposer.preview": LetterSubmitPayload;
    "npc": unknown;
    "zaskTimer": { seconds: number; ok: boolean } | null;
    "moveModeChanged": number;
    "ping": number | null;
    "transportTimer": TransportTimerPayload | null;
    "combatTimer": number | null;
    "combatState": boolean;
    "teamLeaderTargetNoAvatar": number;
    "teamLeaderTargetAvatar": void;
    "teamChange": void;
    "isTeamLeader": boolean;
    "reset": void;
    "refreshPositionWhenAble": void;
    "knowledgeReport": unknown | null;
    "knowledgeDetailsReport": unknown | null;
    "knowledgeReportAction": KnowledgeReportAction;
    "requestKnowledgeReport": void;
    "requestKnowledgeDetailsReport": void;
    "sendCommand": SendCommandEvent;
    "requestHerbCounts": void;
    "herbManagerClose": void;
    "herbCounts": unknown;
    "herbManagerOpen": void;
    "herbTextWindowOpen": void;
    "herbTextWindowClose": void;
    "sound:play": { key: string };
    "playBeep": void;
    "line-start": void;
    "storage": StorageEventPayload;
    "settings": unknown;
    "binds": unknown;
    "uiSettings": UiSettingsEventPayload | null | undefined;
    "mobileButtonsSettings": unknown;
    "desktopButtonsSettings": unknown;
    "orderTimer": number | null;
    "pauserStart": void;
    "pauserEnd": void;
    "client.connect": void;
    "client.disconnect": void;
    "open": Event;
    "close": CloseEvent;
    "error": unknown;
    "gmcp": { path: string; value: unknown };
    "recording.start": string;
    "recording.stop": boolean | undefined;
    "recording.loaded": { name: string; length: number };
    "recording.auto.start": string | null | undefined;
    "recording.auto.stop": RecordingAutoStopPayload;
    "playback.stop": void;
    "playback.pause": void;
    "playback.resume": void;
    "playback.start": number | undefined;
    "playback.speed": number;
    "playback.index": PlaybackIndexPayload;
    "playback.loop.updated": PlaybackLoopState;
    "playback.event": RecordedEvent;
    "playback.timer": { delay: number; startTime: number };
    "message": MessageEventPayload;
    "attackQueueChange": number[];
    "clearAttackQueue": void;
    "addToAttackQueue": number;
    "removeFromAttackQueue": number;
    "parsedObjects": void;
    "parsedNums": { nums: number[] };
    "kill": { killer: "ME" | "TEAM" | "OTHER" };
    "enemyKilled": { objNum: number; killer: "ME" | "TEAM" | "OTHER"; hasBody?: boolean; enemyDesc?: string };
    "allEnemiesKilled": void;
    "plugin:loaded": PluginLoadedPayload;
    "plugin:error": PluginErrorPayload;
    "plugin:destroyed": PluginDestroyedPayload;
    "clock.update": ClockUpdatePayload;
    "clock.domain.active": ClockDomainActivePayload;
    "clock.popup.open": { domain?: "Empire" | "Ishtar" };
    "clock.mismatch": ClockMismatchPayload;
    "clock.sunrise": ClockSunEventPayload;
    "clock.sunset": ClockSunEventPayload;
    "contracts.popup.open": { contracts: Contract[]; currentLocationId: number | null };
    "contracts.updated": { contracts: Contract[] };
    "contracts.remove": { id: string };
    "pluginButtonMacrosChanged": void;
    "pluginButtonMacroStateChanged": { macroType: string; newState: string; oldState: string | undefined };
    "pluginTriggerMacrosChanged": void;
    "shortcuts.addWithRoom": { roomId: number };
    "locationNote.edit": { roomId: number; roomName?: string; areaName?: string };
    "locationNote.open": { roomId: number };
    "locationNote.changed": { roomId: number };
    "pluginLocationNote.changed": { roomId: number; pluginId: string };
    "chat.newMessage": ChatEntry;
    "chat.cleared": void;
    "chat.popup.open": void;
    "combat.newMessage": CombatEntry;
    "combat.cleared": void;
    "combat.popup.open": void;
    "combat.settingsChanged": Record<CombatMessageType, boolean>;
    "postepy.updated": unknown;
    "postepy.popup.open": void;
    "zabici.updated": unknown;
    "zabici.popup.open": void;
    "skroty.popup.open": void;
    "peopleBrowser.popup.open": void;
    "map.centerOn": { roomId: number };
    "map.setLocation": { roomId: number };
    "map.showPath": { toRoomId: number };
    "mapLabelVisibility": boolean;
    "mapAlwaysShowNote": boolean;
    "objectListViewMode": "list" | "card" | "compact";
    "objectListDemo.popup.open": void;
    "layoutManagerStateChanged": { type?: 'import' } | void;
    "walker.popup.open": void;
    "walker.update": WalkerState;
    "poczta.popup.open": void;
    "poczta.fetch": { type: MailType };
    "poczta.loaded": { type: MailType; mails: MailEntry[] };
    "poczta.read": { number: number };
    "poczta.letter.loaded": LetterContent;
    "walker.stop": void;
    "walker.resume": void;
    "walker.setDelay": number;
    "walker.faster": void;
    "walker.slower": void;
    // Lua gag events - combat/blocking
    "tryingToBlock": string;
    "hasBlocked": string;
    "ateamFightingWithNoWeapon": void;
    // Lua gag events - weapon knockoff
    "canWieldAfterKnockOff": void;
    "weaponKnockedOff": void;
    "weaponKnockedOffNekroTilea": void;
    "weapon_state": boolean;
    // Lua gag events - stun
    "stunStart": void;
    "stunEnd": void;
    // Team follow events
    "followSpecialExit": { exit: string };
}

export interface WalkerState {
    active: boolean;
    paused: boolean;
    path: number[];
    currentIndex: number;
    target: number | null;
    delay: number;
}

export interface ObjectData {
    avatar?: boolean
    hp?: number
    enemy?: boolean
    attack_num?: number
    team?: boolean
    team_leader?: boolean
    avatar_target?: boolean
    attack_target?: boolean
    defense_target?: boolean
    hidden?: boolean
    can_see_in_room?: boolean
    paralyzed?: boolean
    editing?: boolean
}

export type ClientEvents = KnownEvents & {
    "gmcp.objects.data": Map<number, ObjectData>
    [key: `gmcp.${string}`]: unknown;
    [key: `gmcp_msg.${string}`]: AnsiAwareBuffer;
};
