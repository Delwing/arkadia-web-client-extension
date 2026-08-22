import Client from "../Client";
import initShop, {formatItem, ShopOptions} from "./lib/shop";

export default function initArmorShop(client: Client) {
    const options: ShopOptions = {
        normalWidth: 75,
        tag: 'armor-shop',
        splitReg: /^-{75}$/,
        headerReg: /^\|\s*Nazwa towaru\s*\|\s*Mithryl\s*\|\s*Zloto\s*\|\s*Srebro\s*\|\s*Miedz\s*\|$/,
        itemReg: /^\|\s*(.+?)\s*\|\s*(\d*)\s*\|\s*(\d*)\s*\|\s*(\d*)\s*\|\s*(\d*)\s*\|$/,
        makeSplit: (width) => "-".repeat(Math.max(0, width)),
        makeHeader: (width, pad) => {
            return `| ${pad('Nazwa towaru', width - 3)}|`
        },
        makeItem: (width, pad, m, originalFormatting) => formatItem(width, pad, m, undefined, undefined, originalFormatting)
    };

    initShop(client, options);
}
