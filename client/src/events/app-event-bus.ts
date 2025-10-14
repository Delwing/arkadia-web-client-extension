import {EventBus} from "./event-bus";
import type {ClickCallbackMap} from "../OutputHandler";
import type {LetterSubmitPayload} from "../types/letter";
import {Settings} from "../defaultSettings";
import type {BindSettings} from "../types/binds";
import {UiSettings} from "sandbox-react/src/uiSettings";
import {ButtonSetting} from "sandbox-react/src/mobileButtonSettings";

type AppEvents = {
    "attackQueueChange": string[];
    "binds": BindSettings;
    'client.disconnect': void;
    'client.connect': void;
    'command': string;
    'port-connected': void;
    'output-sent': number | null | void;
    'buffer-sent': number | void;
    'output': {
        message: string;
        type?: string;
        clickCallbacks?: ClickCallbackMap;
    };
    'mapMove': void;
    'stepBack': void;
    'leadTo': number | string;
    'notify': { text: string, time?: number };
    'lampTimer': number | null;
    'coverTimer': number | null;
    'breakItem': { text: string; command?: string };
    'packageStatus': { recipient: string; seconds?: number } | null;
    'releaseGuard': boolean;
    'attackMode': 'A' | 'AW' | 'AWR';
    'contentWidth': number;
    'enterLocation': { id: number; room: any };
    'highlights': number[];
    'killed': { mob: string, isTeamKill: boolean };
    'pauserStart': void;
    'pauserEnd': void;
    'multibinds': { list: { index: number; action: string; label: string }[] };
    'letterComposer': { open: boolean };
    'letterComposer.submit': LetterSubmitPayload;
    'letterComposer.preview': LetterSubmitPayload;
    'npc': any;
    'zaskTimer': { seconds: number; ok: boolean } | null;
    'moveModeChanged': number;
    'line': { text: string, type: string };
    'line-start': void;
    'message': { text: string, type: string, callbackMap?: ClickCallbackMap };
    'gmcp': { path: string; value: any };
    'refreshPositionWhenAble': void;
    'teamLeaderTargetNoAvatar': string;
    'teamLeaderTargetAvatar': void;
    'teamChange': void;
    'recording.start': string;
    'recording.stop': boolean | undefined;
    'playback.start': number | void;
    'playback.stop': void;
    'playback.pause': void;
    'playback.resume': void;
    'playback.index': { current: number, total: number };
    'reset': void;
    'settings': Settings
    'uiSettings': UiSettings,
    playBeep: void
    mobileButtonsSettings: Record<string, ButtonSetting>
    'map-position-change': void
    systemRebirth: number | undefined
}

export type ClientEvents = AppEvents & {
    [key: `gmcp.${string}`]: any;
    [key: `gmcp_msg.${string}`]: string;
};

const GLOBAL_EVENT_BUS_KEY = "__arkadia_event_bus__";

type GlobalWithEventBus = typeof globalThis & {
    [GLOBAL_EVENT_BUS_KEY]?: EventBus<ClientEvents>;
};

const globalObject = globalThis as GlobalWithEventBus;

if (!globalObject[GLOBAL_EVENT_BUS_KEY]) {
    globalObject[GLOBAL_EVENT_BUS_KEY] = new EventBus<ClientEvents>();
}

const appEventBus = globalObject[GLOBAL_EVENT_BUS_KEY]!;

export default appEventBus;