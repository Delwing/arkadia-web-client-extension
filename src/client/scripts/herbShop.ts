import Client from "../Client";
import initShop, { ShopOptions, formatItem } from "./shop";

export default function initHerbShop(client: Client) {
    const options: ShopOptions = {
        normalWidth: 88,
        tag: 'herb-shop',
        splitReg: /^\+-{58}\+-{4}\+-{4}\+-{4}\+-{4}\+-{7}\+$/,
        headerReg: /^\|\s*Nazwa towaru\s*\|\s*mt\s*\|\s*zl\s*\|\s*sr\s*\|\s*md\s*\|\s*Ilosc\s*\|$/,
        itemReg: /^\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|$/,
        makeSplit: (width) => `+${"-".repeat(Math.max(0, width - 2))}+`,
        makeHeader: (width, pad) => {
            const nameLine = `| ${pad('Nazwa towaru', width - 3)}|`;
            const numbersLine = `| ${pad('mt/zl/sr/md Ilosc', width - 3)}|`;
            return nameLine + '\n' + numbersLine;
        },
        makeItem: (width, pad, m) => formatItem(
            width,
            pad,
            m,
            6
        )
    };

    initShop(client, options);
}
