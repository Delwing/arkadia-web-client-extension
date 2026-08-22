import Client from "../../Client";
import { colorString } from "@modules/core/Colors";
import {AnsiAwareBuffer, FormatStateSnapshot} from "../../ansi/FormatState";
import {
    MITHRIL_COLOR,
    GOLD_COLOR,
    SILVER_COLOR,
    COPPER_COLOR
} from "../../constants/colors";

export interface ShopOptions {
    normalWidth: number;
    tag: string;
    splitReg: RegExp;
    headerReg: RegExp;
    itemReg: RegExp;
    makeSplit: (width: number) => string;
    makeHeader: (width: number, pad: (s: string, len: number) => string) => string;
    makeItem: (width: number, pad: (s: string, len: number) => string, match: RegExpMatchArray, originalFormatting?: FormatStateSnapshot) => AnsiAwareBuffer;
}

const CURRENCY_COLORS = [
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
    colors: readonly FormatStateSnapshot[] = CURRENCY_COLORS,
    originalFormatting?: FormatStateSnapshot
): AnsiAwareBuffer {
    const name = match[1];
    const costs = match.slice(2, 6);
    const amount = typeof amountIndex === 'number' ? match[amountIndex] : undefined;

    // Build colored costs by appending AnsiAwareBuffer objects
    const coloredCostsBuffer = new AnsiAwareBuffer();
    costs.forEach((c, i) => {
        if (i > 0) {
            coloredCostsBuffer.append('/');
        }
        coloredCostsBuffer.appendBuffer(colorString(c === "" ? "0" : c, colors[i]));
    });

    const amountPrefix = amount ? `${amount.padStart(3)}| ` : "";
    const namePart = `${amountPrefix}${name}`;
    const numbersContent = coloredCostsBuffer.text;
    const combined = `${namePart} ${numbersContent}`;
    const combinedLen = combined.length;
    const fitsSingleLine = combinedLen <= width - 4;
    if (fitsSingleLine) {
        const spaces = ".".repeat(Math.max(0, width - 3 - combinedLen - 2));
        const result = new AnsiAwareBuffer('', originalFormatting);
        result.append('| ', originalFormatting);
        result.append(namePart, originalFormatting);
        result.append(' ', originalFormatting);
        result.append(spaces, originalFormatting);
        result.append(' ', originalFormatting);
        result.appendBuffer(coloredCostsBuffer);
        result.append(' |', originalFormatting);
        return result;
    }

    const nameLine = `| ${pad(namePart, width - 3)}|`;
    const result = new AnsiAwareBuffer(nameLine, originalFormatting);
    result.append('\n', originalFormatting);
    result.append('| ', originalFormatting);
    result.appendBuffer(coloredCostsBuffer);
    const paddingNeeded = width - 3 - coloredCostsBuffer.text.length;
    result.append(' '.repeat(Math.max(0, paddingNeeded)), originalFormatting);
    result.append('|', originalFormatting);
    return result;
}

export default function initShop(client: Client, opts: ShopOptions) {
    let width = client.contentWidth;
    client.on('contentWidth', (value) => {
        width = value;
    });

    const pad = (str: string, len: number) => str + " ".repeat(Math.max(0, len - str.length));

    client.Triggers.registerTrigger(opts.splitReg, (line) => {
        if (width >= opts.normalWidth) return line;
        const originalFormatting = line.getStateAt(0);
        return new AnsiAwareBuffer(opts.makeSplit(width), originalFormatting);
    }, opts.tag);

    client.Triggers.registerTrigger(opts.headerReg, (line) => {
        if (width >= opts.normalWidth) return line;
        const originalFormatting = line.getStateAt(0);
        return new AnsiAwareBuffer(opts.makeHeader(width, pad), originalFormatting);
    }, opts.tag);

    client.Triggers.registerTrigger(opts.itemReg, (line, matches) => {
        if (width >= opts.normalWidth) return line;
        if (!matches) return line;
        const originalFormatting = line.getStateAt(0);
        return opts.makeItem(width, pad, matches, originalFormatting);
    }, opts.tag);
}
