export type CharGender = 'male' | 'female';

export interface GmcpCharInfo {
    object_num?: number;
    name?: string;
    gender?: CharGender;
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
    autocorrect?: number;
    blood?: number;
    boards_hidden?: number;
    brief?: number;
    colors?: number;
    common_hidden?: number;
    condition?: number;
    death_startloc?: number;
    echo?: number;
    form?: number;
    group_cover?: number;
    hand?: number;
    keepalive?: number;
    knowledge_hidden?: number;
    mail_hidden?: number;
    max_idle_time?: number;
    more_len?: number;
    no_get_items?: number;
    no_prompt?: number;
    order_attack?: number;
    order_block?: number;
    order_break_cover?: number;
    order_cover?: number;
    panic?: number;
    parsing_order?: number;
    relations_hidden?: number;
    screen_width?: number;
    special?: number;
    state_info?: number;
    state_modifiers?: number;
    stop_combat_escape?: number;
    stop_combat_hide?: number;
    title_extra?: number | string;
    title_lay?: number;
    title_race?: number;
    who_presence?: number;
    withdrawal?: number;
}

/**
 * Char.Options.Info — sent automatically after login and on `opcje` changes.
 * Each field is an array of allowed values for the corresponding option.
 * `title_extra` is user-dependent (can contain dynamic strings, e.g. titles
 * the character has earned).
 */
export interface GmcpCharOptionsInfo {
    autocorrect?: number[];
    blood?: number[];
    boards_hidden?: number[];
    brief?: number[];
    colors?: number[];
    common_hidden?: number[];
    condition?: number[];
    death_startloc?: number[];
    echo?: number[];
    form?: number[];
    group_cover?: number[];
    hand?: number[];
    keepalive?: number[];
    knowledge_hidden?: number[];
    mail_hidden?: number[];
    max_idle_time?: number[];
    more_len?: number[];
    no_get_items?: number[];
    no_prompt?: number[];
    order_attack?: number[];
    order_block?: number[];
    order_break_cover?: number[];
    order_cover?: number[];
    panic?: number[];
    parsing_order?: number[];
    relations_hidden?: number[];
    screen_width?: number[];
    special?: number[];
    state_info?: number[];
    state_modifiers?: number[];
    stop_combat_escape?: number[];
    stop_combat_hide?: number[];
    title_extra?: Array<number | string>;
    title_lay?: number[];
    title_race?: number[];
    who_presence?: number[];
    withdrawal?: number[];
    [key: string]: Array<number | string> | undefined;
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
