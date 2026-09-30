import Client from "../Client";
import { colorString, createColorFormat } from "@modules/core/Colors";
import { getShortDir } from "@shared/map";
import {AnsiAwareBuffer} from "../ansi/FormatState";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";
import shortExitsPatterns from "./short_exits_patterns.json";
import { upstreamPatterns, type UpstreamTrigger } from "./upstreamTriggers";

export { getShortDir as toShort };

export function parseExitString(str: string): string[] {
    return str
        .replace(/ i | oraz | albo | lub /g, ",")
        .split(/,\s*/)
        .map(s => s.trim())
        .filter(Boolean);
}

// Generated from upstream Arkadia.xml by scripts/extract-upstream-triggers.mjs.
// Upstream nests these under a `room.exits` message-type check; like the hand
// copy they replace, they are registered without it and match any line.
const EXIT_PATTERNS = upstreamPatterns(shortExitsPatterns as UpstreamTrigger[], "trigger_func_mapper_directions_ui_wyjscia");

export default function initShortExits(client: Client) {
    let enabled = false;
    let exitsPrefix = defaultSettings.shortExitsPrefix ?? '-----:';
    let exitsSeparator = defaultSettings.shortExitsSeparator ?? ' ';
    let exitsColor: any = createColorFormat(defaultSettings.shortExitsColor ?? '#ffa500');
    let exitsBackgroundColor = defaultSettings.shortExitsBackgroundColor ?? 'transparent';

    const createExitsFormat = (fgHex: string, bgHex: string) => {
        const format: any = {
            foreground: { space: 'hex', color: fgHex },
        };
        if (bgHex && bgHex !== 'transparent') {
            format.background = { space: 'hex', color: bgHex };
        }
        return format;
    };

    const applySettings = (settings: any) => {
        const detail = settings ?? defaultSettings;
        enabled = !!detail.shortenExits;
        exitsPrefix = detail.shortExitsPrefix ?? defaultSettings.shortExitsPrefix ?? '-----:';
        exitsSeparator = detail.shortExitsSeparator ?? defaultSettings.shortExitsSeparator ?? ' ';
        exitsBackgroundColor = detail.shortExitsBackgroundColor ?? defaultSettings.shortExitsBackgroundColor ?? 'transparent';
        exitsColor = createExitsFormat(
            detail.shortExitsColor ?? defaultSettings.shortExitsColor ?? '#ffa500',
            exitsBackgroundColor,
        );
    };

    const initialSettings = characterStorage.get('settings');
    if (initialSettings) {
        applySettings(initialSettings);
    }

    characterStorage.onChange('settings', applySettings);

    const callback = (line: AnsiAwareBuffer, matches: RegExpMatchArray) => {
        if (!enabled) return line;
        if (!matches) return line;
        const dirs: string[] = parseExitString(matches[1]).map(getShortDir);
        if (dirs.length === 0) return line;
        const str = exitsPrefix + dirs.map(d => exitsSeparator + d.toUpperCase()).join('');
        return colorString(str, exitsColor);
    };

    client.Triggers.registerTrigger(EXIT_PATTERNS, callback, 'shortExits');
}
