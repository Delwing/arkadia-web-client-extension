import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";
import {gmcp} from "../gmcp";

const SEASON_NAMES = ["wiosna", "lato", "jesien", "zima"];
const SEASON_TEXT = SEASON_NAMES.map(n => `[ ${n.toUpperCase()} ]`);
const SEASON_COLORS = [
    createColorFormat("#00ff7f"),
    createColorFormat("#ffff00"),
    createColorFormat("#ff8c00"),
    createColorFormat("#00bfff"),
];

export default function initSeasonPrint(client: Client) {
    const tag = "season-print";
    const patterns = [
        /^Jest w przyblizeniu (\w+)(?: (?:(?:|w|po|przed|nad|poznym) |)(dzien|nocy|poludniu|poludniem|poludnie|rano|ranem|wieczorem)|),(.*,)? ((?:noc \w+|[A-Z].+?)|(.*) dzien pory (\w+)) wedlug rachuby czasu Starszego Ludu\.$/,
        /^Jest w przyblizeniu (\w+) (?:|w|po|przed|nad|poznym)\s*(dzien|nocy|poludniu|poludniem|poludnie|rano|ranem|wieczorem).*, ((?:dzien|noc) (\w+)|(.*) dzien miesiaca (\w+)) wedlug Kalendarza Imperialnego\.$/
    ];

    patterns.forEach(pattern => {
        client.Triggers.registerTrigger(pattern, line => {
            const idx = typeof gmcp?.room?.time?.season === "number" ? gmcp.room.time.season : -1;
            if (idx < 0 || idx >= SEASON_NAMES.length) return line;
            return line.append(" " + SEASON_TEXT[idx], SEASON_COLORS[idx]);
        }, tag);
    });
}
