export type SoundCategory =
    | 'attack'
    | 'hp'
    | 'fishing'
    | 'lamp'
    | 'gear'
    | 'transport'
    | 'spell'
    | 'block'
    | 'weapon'
    | 'stun';

import {CommandOptions} from "@client/scripts/commandPreserveCaseMode.ts";
import {LetterSubmitPayload} from "@client/types/letter.ts";
import {TransportTimerPayload, TransportRoutePayload, TransportDebugState, TransportTimesDebugPayload, TransportLegResetPayload} from "@client/types/transport.ts";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";
import {PluginInfo} from "@shared/types/Plugin.ts";
import type {RecordedEvent} from "@shared/recorder/Recorder.ts";
import type {Contract} from "@client/scripts/contracts.ts";
import type {ChatEntry} from "@client/scripts/chatHistory.ts";
import type {CombatEntry, CombatMessageType} from "@client/scripts/combatWindow.ts";
import type {CombatStatsSnapshot} from "@client/scripts/combatStats.ts";
import type {CechySnapshot} from "@client/scripts/lvlCalc.ts";
import type {MailEntry, MailType, LetterContent} from "@client/scripts/poczta.ts";
import type {FishingStatePayload, BaitType} from "@client/scripts/fishing.ts";
import type {LootPopupPayload, GroundItem} from "@client/scripts/lootParser.ts";
import type {SyncCategory, CategoryConflictInfo, CategorySyncTimes} from "@modules/firebase/firebaseTypes";
import type {GmcpCharInfo, GmcpCharState, GmcpCharOptions, GmcpCharOptionsInfo, GmcpCharColors, GmcpRoomInfo, GmcpRoomTime, GmcpMsgType} from "./gmcpTypes";

export type FirebaseSyncMetadataPayload = Partial<Record<SyncCategory, {
    exists: boolean;
    syncedAt?: string;
    deviceId?: string;
    encrypted?: boolean;
}>>;

export type SendCommandEvent = {
    command: string;
    echo?: boolean;
    options?: CommandOptions;
};

type NotificationPayload = {
    text: string;
    time?: number;
    /** Also fire an OS/browser notification (when permission allows). Defaults to false: in-app toast only. */
    system?: boolean;
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
    seconds?: number;
    location?: number;
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

type ClockSetTimePayload = {
    domain: "Empire" | "Ishtar";
    hour: number;
    minutes?: number;
    dayOfYear?: number;
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
    "output-sent": number;
    "buffer-sent": number;
    "mapMove": void;
    "mapReady": void;
    "renderMapLocation": { locationId: number };
    "stepBack": void;
    "leadTo": number;
    "clearLeadTo": void;
    "tripPlanner.leadTo": [number[]];
    "tripPlanner.addStop": { roomId: number };
    "tripPlanner.popup.open": void;
    "mapPath": { segments: Array<{ path: number[]; color: string }> } | null;
    "mapTransportHops": [Array<{ fromRoomId: number; toRoomId: number; transportName: string; label?: string; color: string }> | null];
    "mapHighlights": [{ roomId: number; color: string }[]];
    "mapLostRooms": [number[]];
    "mapLocationLabel": string;
    "requestMapLocationLabel": void;
    "requestMapHighlights": void;
    "requestMapLostRooms": void;
    "requestMapPath": void;
    "notify": NotificationPayload;
    "lampTimer": number | null;
    "coverTimer": number | null;
    "breakItem": { text: string; command?: string } | null;
    "pipeLit": boolean;
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
    "transportRoute": TransportRoutePayload | null;
    "transportDebug": TransportDebugState | null;
    "transportDebug.toggle": void;
    "transportTimesDebug": TransportTimesDebugPayload;
    "transportTimesDebug.request": void;
    "transportTimesDebug.popup.toggle": void;
    "transportTimesDebug.resetLeg": TransportLegResetPayload;
    "transportArrival": number;
    "transportDeparture": void;
    "transport.popup.open": void;
    "transport.onBoard": boolean;
    "combatTimer": number | null;
    "worldDestructionTimer": number | null;
    "combatState": boolean;
    "teamLeaderTargetNoAvatar": number;
    "teamLeaderTargetAvatar": void;
    "teamChange": void;
    "teamPanelStatus": { teamSize: number; missing: string[] };
    "isTeamLeader": boolean;
    "reset": void;
    "refreshPositionWhenAble": void;
    "knowledgeReport": unknown | null;
    "knowledgeReport.popup.open": void;
    "knowledgeReportCurrentLibrary": string | null;
    "knowledgeDetailsReport": unknown | null;
    "knowledgeDetailsUpdated": { character: string };
    "knowledgeDetails.popup.open": void;
    "knowledgeReportAction": KnowledgeReportAction;
    "requestKnowledgeReport": void | { character?: string };
    "requestKnowledgeDetailsReport": void;
    "knowledgeHints": { enabled: boolean; hideCompleted: boolean };
    "knowledgeTickEvent": { category: string; dative: string };
    "knowledgeBookReport": unknown | null;
    "knowledgeBookReportAction": { type: string; bookKey: string; category: string };
    "requestKnowledgeBookReport": void | { character?: string };
    "wiedzaImportLibraries": { character: string; libraries: unknown[] };
    "wiedzaImportBooks": { character: string; books: unknown[] };
    "wiedzaImportTotalLevels": { character: string; levels: unknown[] };
    "leadToByInternalId": string;
    "sendCommand": SendCommandEvent;
    "printLine": string | AnsiAwareBuffer;
    "requestHerbCounts": void;
    "herbManagerClose": void;
    "herbCounts": unknown;
    "herbManagerOpen": void;
    "herbTextWindowOpen": void;
    "herbTextWindowClose": void;
    "sound:play": { key: string };
    "sound:muted": boolean;
    "sound:category": SoundCategory;
    "playSound": SoundCategory;
    "line-start": void;
    "mobileButtonsSettings": unknown;
    "mobileButtonsResetPosition": void;
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
    "worldTime.popup.open": void;
    "clock.mismatch": ClockMismatchPayload;
    "clock.sunrise": ClockSunEventPayload;
    "clock.sunset": ClockSunEventPayload;
    "clock.parsedTime": { domain: "Empire" | "Ishtar"; hour: number; dayOfYear: number };
    "clock.setTime": ClockSetTimePayload;
    "contracts.popup.open": { contracts: Contract[]; currentLocationId: number | null };
    "contracts.updated": { contracts: Contract[] };
    "contracts.remove": { id: string };
    "fishing.popup.open": FishingStatePayload;
    "fishing.state": FishingStatePayload;
    "fishing.cast": { bait: BaitType };
    "fishing.pull": void;
    "fishing.strike": void;
    "packageReceiver.popup.open": void;
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
    "combatStatus.popup.open": void;
    "layout.toggleLock": void;
    "combat.settingsChanged": Record<CombatMessageType, boolean>;
    "stat.updated": CombatStatsSnapshot;
    "stat.cleared": void;
    "stat.popup.open": void;
    "postepy.updated": unknown;
    "postepy.popup.open": void;
    "cechy.read": CechySnapshot;
    "cechy.history.updated": void;
    "cechy.popup.open": void;
    "cechy.enableModifiers": void;
    "postepy2.updated": void;
    "postepy2.popup.open": void;
    "zlom.updated": void;
    "zlom.snapshotReplaced": void;
    "zlom.popup.open": void;
    "oswajanie.updated": void;
    "oswajanie.popup.open": { view?: "animals" | "history" | "help"; animal?: string };
    "zabici.updated": unknown;
    "zabici.popup.open": void;
    "zabici2.updated": unknown;
    "zabici2.popup.open": void;
    "deposits.updated": void;
    "deposits.popup.open": { filter?: string };
    "skroty.popup.open": void;
    "peopleBrowser.popup.open": void;
    "dataSources.popup.open": void;
    "map.centerOn": { roomId: number };
    "map.setLocation": { roomId: number };
    "mapLabelVisibility": boolean;
    "mapAlwaysShowNote": boolean;
    "mapShowGrid": boolean;
    "mapShowAreaExitLabels": boolean;
    "mapShowTransportStops": boolean;
    "objectListViewMode": "list" | "card" | "compact" | "compact-dots" | "raid" | "nearby";
    "objectList.showWeaponState": boolean;
    "objectList.showCoverTimer": boolean;
    "objectList.showOrderTimer": boolean;
    "objectList.showZaskTimer": boolean;
    "objectList.togglePip": void;
    "objectList.pipActiveChanged": boolean;
    "objectListDemo.popup.open": void;
    /** Demo popup -> client: replace the attack queue (drives the gold next-target mark). */
    "objectListDemo.setQueue": { ids: number[] };
    "layoutManagerStateChanged": { type?: 'import' } | void;
    "walker.popup.open": void;
    "walker.update": WalkerState;
    "poczta.popup.open": void;
    "poczta.fetch": { type: MailType };
    "poczta.loaded": { type: MailType; mails: MailEntry[] };
    "poczta.read": { number: number };
    "poczta.letter.loaded": LetterContent;
    "roomInfo.popup.open": { roomId: number };
    "staticmap.popup.open": { roomId?: number; areaId?: number; instanceId?: string };
    "mapDataChanged": void;
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
    // Lua gag events - maneuver
    "maneuverAttempted": void;
    // Loot events
    "loot.popup.open": LootPopupPayload;
    "loot.popup.closed": void;
    "loot.cleared": void;
    "loot.ground.open": { items: GroundItem[] };
    "profession.popup.open": void;
    "profession.updated": void;
    "sunTracker.popup.open": { domain?: "Empire" | "Ishtar" } | void;
    "sunTracker.updated": { domain: "Empire" | "Ishtar" } | void;
    // Firebase real-time sync listener events
    "firebase.sync.metadata": FirebaseSyncMetadataPayload;
    "firebase.sync.applied": { categories: SyncCategory[] };
    "firebase.sync.conflict": { conflicts: CategoryConflictInfo[] };
    "firebase.sync.pendingPassphrase": { categories: SyncCategory[] };
    "firebase.sync.error": { message: string };
    "firebase.sync.uploaded": { categories: SyncCategory[]; timestamps: CategorySyncTimes; encrypted: boolean; auto: boolean };
    "firebase.autosync.pending": { pending: boolean };
    "firebase.listener.status": { active: boolean };
    "flushLines": [{ text: string; type: string }[]];
    "socket.incoming": string;
    "socket.outgoing": string;
    "telnet.echo": boolean;
    "playback.incomingData": [data: string, options?: { timestamp?: number }];
    "helperHotkey": [id: string, key: string];
    /** Helper system only */
    "helperBind": string;
    "executeFunctionalBind": void;
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

type GmcpMsgEvents = {
    [K in GmcpMsgType as `gmcp_msg.${K}`]: AnsiAwareBuffer;
};

export type ClientEvents = KnownEvents & GmcpMsgEvents & {
    "gmcp.objects.data": Map<number, ObjectData>
    "gmcp.objects.nums": [number[]];
    "gmcp.char.info": GmcpCharInfo;
    "gmcp.char.state": GmcpCharState;
    "gmcp.char.options": GmcpCharOptions;
    "gmcp.char.options.info": GmcpCharOptionsInfo;
    "gmcp.char.colors": GmcpCharColors;
    "gmcp.room.info": GmcpRoomInfo;
    "gmcp.room.time": GmcpRoomTime;
    "gmcp.core.ping": void;
    [key: `gmcp.${string}`]: unknown;
    [key: `gmcp_msg.${string}`]: AnsiAwareBuffer;
};
