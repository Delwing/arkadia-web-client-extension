import Client from "../Client";
import initShop, { ShopOptions, formatItem } from "./lib/shop";
import loadHerbs from "./lib/herbsLoader";
import type { HerbsData } from "./lib/herbsLoader";
import { createColorFormat } from "@modules/core/Colors";
import { getUiPort } from "@client/ports";

const HERB_SHOP_LINK_COLOR = createColorFormat("#ffff00");

const HERB_FIXES: Record<string, string> = {
    "mak": "mak_polny"
};

function fixHerbName(herb: string): string {
    return HERB_FIXES[herb] ?? herb;
}

function getHerbBuyCase(herbs: HerbsData, herbId: string): string {
    const forms = herbs.herb_id_to_odmiana[herbId];
    if (forms) {
        return forms.biernik;
    }
    return herbId.replace(/_/g, " ");
}

export default function initHerbShop(client: Client) {
    const tag = 'herb-shop';

    const options: ShopOptions = {
        normalWidth: 88,
        tag,
        splitReg: /^\+-{58}\+-{4}\+-{4}\+-{4}\+-{4}\+-{7}\+$/,
        headerReg: /^\|\s*Nazwa towaru\s*\|\s*mt\s*\|\s*zl\s*\|\s*sr\s*\|\s*md\s*\|\s*Ilosc\s*\|$/,
        itemReg: /^\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|$/,
        makeSplit: (width) => `+${"-".repeat(Math.max(0, width - 2))}+`,
        makeHeader: (width, pad) => {
            const nameLine = `| ${pad('Nazwa towaru', width - 3)}|`;
            const numbersLine = `| ${pad('mt/zl/sr/md Ilosc', width - 3)}|`;
            return nameLine + '\n' + numbersLine;
        },
        makeItem: (width, pad, m, originalFormatting) => formatItem(
            width,
            pad,
            m,
            6,
            undefined,
            originalFormatting
        )
    };

    initShop(client, options);

    loadHerbs().then(herbs => {
        if (!herbs) return;

        client.Triggers.registerTrigger(
            /^\|\s*.+?\(([^)]+)\)\s*\|.*\|\s*(\d+)\s*\|$/,
            (line, matches) => {
                const herbName = matches[1];
                const amount = parseInt(matches[2], 10);
                if (!herbName || amount <= 0) return line;

                const herbId = fixHerbName(herbName.replace(/ /g, "_"));
                const herbCase = getHerbBuyCase(herbs, herbId);
                const buyCmd = `kup 1 ${herbCase}`;

                const lineText = line.text;
                const parenMatch = lineText.match(
                    new RegExp(`\\(${herbName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`)
                );
                if (parenMatch && parenMatch.index !== undefined) {
                    const start = parenMatch.index;
                    const end = start + parenMatch[0].length;
                    line.color([start, end], HERB_SHOP_LINK_COLOR);
                    line.createLink([start, end], {
                        onClick: () => client.sendCommand(buyCmd),
                        onMouseEnter: (ev) => {
                            getUiPort().showHerbTooltip(herbId, herbs.herb_id_to_use[herbId], ev.pageX, ev.pageY);
                        },
                        onMouseLeave: () => {
                            getUiPort().hideHerbTooltip();
                        },
                        title: buyCmd,
                    });
                }

                return line;
            },
            tag,
        );
    });
}
