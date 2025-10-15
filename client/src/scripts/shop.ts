import Client from "../Client";
import { colorString, findClosestColor } from "../Colors";
import { stripAnsiCodes } from "../Triggers";

export interface ShopOptions {
    normalWidth: number;
    tag: string;
    splitReg: RegExp;
    headerReg: RegExp;
    itemReg: RegExp;
    makeSplit: (width: number) => string;
    makeHeader: (width: number, pad: (s: string, len: number) => string) => string;
    makeItem: (width: number, pad: (s: string, len: number) => string, match: RegExpMatchArray) => string;
}

export const MITHRIL_COLOR = findClosestColor('#afeeee');
export const GOLD_COLOR = findClosestColor('#FFD700');
export const SILVER_COLOR = findClosestColor('#dadada');
export const COPPER_COLOR = findClosestColor('#8B4513');
export const CURRENCY_COLORS = [
    MITHRIL_COLOR,
    GOLD_COLOR,
    SILVER_COLOR,
    COPPER_COLOR,
] as const;

export function formatItem(
    width: number,
    pad: (s: string, len: number) => string,
    match: RegExpMatchArray,
    amountIndex?: number,
    colors: readonly number[] = CURRENCY_COLORS
): string {
    const name = match[1];
    const costs = match.slice(2, 6);
    const amount = typeof amountIndex === 'number' ? match[amountIndex] : undefined;

    const coloredCosts = costs.map((c, i) => colorString(c === "" ? "0" : c, colors[i])).join('/');

    const amountPrefix = amount ? `${amount.padStart(3)}| ` : "";
    const namePart = `${amountPrefix}${name}`;
    const numbersContent = coloredCosts;
    const combined = `${namePart} ${numbersContent}`;
    const strippedLen = stripAnsiCodes(combined).length;
    const fitsSingleLine = strippedLen <= width - 4;
    if (fitsSingleLine) {
        const spaces = ".".repeat(Math.max(0, width - 3 - strippedLen - 2));
        return `| ${namePart} ${spaces} ${numbersContent} |`;
    }

    const availableWidth = width - 3;
    if (availableWidth <= 0) {
        return '| |';
    }

    const prefixLength = stripAnsiCodes(amountPrefix).length;
    const indent = ' '.repeat(Math.min(prefixLength, Math.max(0, availableWidth)));

    const wrapPlainText = (text: string, firstLimit: number, subsequentLimit: number) => {
        const segments: string[] = [];
        let remaining = text;
        let limit = firstLimit;

        while (remaining.length > 0) {
            const trimmed = remaining.trimStart();
            const currentLimit = Math.max(1, limit);
            if (trimmed.length <= currentLimit) {
                segments.push(trimmed);
                break;
            }

            let cut = trimmed.lastIndexOf(' ', currentLimit);
            if (cut <= 0) {
                cut = currentLimit;
                segments.push(trimmed.slice(0, cut));
                remaining = trimmed.slice(cut);
            } else {
                segments.push(trimmed.slice(0, cut));
                remaining = trimmed.slice(cut + 1);
            }

            if (remaining.length === 0) {
                break;
            }

            limit = subsequentLimit;
        }

        if (segments.length === 0) {
            segments.push('');
        }

        return segments.map((segment) => segment.trimEnd());
    };

    const textLimit = availableWidth - prefixLength;
    const nameSegments = wrapPlainText(name, textLimit, textLimit);
    const nameLines = nameSegments.map((segment, index) => {
        const prefix = index === 0 ? amountPrefix : indent;
        return `| ${pad(prefix + segment, availableWidth)}|`;
    });

    const numbersLine = `| ${pad(numbersContent, availableWidth)}|`;
    return [...nameLines, numbersLine].join('\n');
}

export default function initShop(client: Client, opts: ShopOptions) {
    let width = client.contentWidth;
    client.addEventListener('contentWidth', (ev: CustomEvent) => {
        width = ev.detail;
    });

    const truncateWithAnsi = (str: string, len: number) => {
        if (len <= 0) {
            return '';
        }

        let visible = 0;
        let i = 0;
        let result = '';
        let needsReset = false;

        while (i < str.length && visible < len) {
            const char = str[i];
            if (char === '\u001b') {
                const match = str.slice(i).match(/^\x1b\[[0-9;]*m/);
                if (match) {
                    const code = match[0];
                    result += code;
                    i += code.length;
                    if (code === '\u001b[0m') {
                        needsReset = false;
                    } else {
                        needsReset = true;
                    }
                    continue;
                }
            }

            const codePoint = str.codePointAt(i);
            if (codePoint === undefined) {
                break;
            }

            const symbol = String.fromCodePoint(codePoint);
            result += symbol;
            visible += 1;
            i += symbol.length;
        }

        if (needsReset && !result.endsWith('\u001b[0m')) {
            result += '\u001b[0m';
        }

        return result;
    };

    const pad = (str: string, len: number) => {
        const plainLength = stripAnsiCodes(str).length;
        if (plainLength >= len) {
            return truncateWithAnsi(str, len);
        }
        return str + ' '.repeat(len - plainLength);
    };

    client.Triggers.registerTrigger(opts.splitReg, () => {
        if (width >= opts.normalWidth) return undefined;
        return opts.makeSplit(width);
    }, opts.tag);

    client.Triggers.registerTrigger(opts.headerReg, () => {
        if (width >= opts.normalWidth) return undefined;
        return opts.makeHeader(width, pad);
    }, opts.tag);

    client.Triggers.registerTrigger(opts.itemReg, (_raw, _line, m) => {
        if (width >= opts.normalWidth) return undefined;
        return opts.makeItem(width, pad, m);
    }, opts.tag);
}
