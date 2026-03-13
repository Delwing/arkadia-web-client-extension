export interface GmcpCharInfo {
    object_num?: number;
    name?: string;
}

export interface GmcpCharState {
    hp?: number;
    mana?: number;
    fatigue?: number;
    improve?: number;
    form?: number;
    intox?: number;
    headache?: number;
    stuffed?: number;
    soaked?: number;
    encumbrance?: number;
    panic?: number;
    state?: string;
}

export interface GmcpCharOptions {
    form?: number;
}

export interface GmcpCharColors {
    text?: number;
}

export interface GmcpRoomInfoMap {
    domain?: string;
    x?: number;
    y?: number;
    z?: number;
    id?: string;
    name?: string;
}

export interface GmcpRoomInfo {
    map?: GmcpRoomInfoMap;
    exits?: string[];
    num?: number;
    id?: number;
    hash?: string;
    [key: string]: unknown;
}

export interface GmcpRoomTime {
    daylight?: boolean;
    time?: { daylight?: boolean };
    season?: number;
}

export type GmcpMsgType =
    | "combat.avatar"
    | "combat.team"
    | "combat.others"
    | "emotes"
    | "comm"
    | "room.combat"
    | "room.long"
    | "room.short"
    | "room.item"
    | "room.exits"
    | "room.contents.living"
    | "room.contents.object"
    | "room.contents"
    | "living.long"
    | "object.long"
    | "system"
    | "system.login"
    | "mail"
    | "editor.mail"
    | "editor"
    | "notification.mail"
    | "notification.common"
    | "notification.knowledge"
    | "notification.relations"
    | "notification.boards"
    | "notification"
    | "prompt"
    | "other";
