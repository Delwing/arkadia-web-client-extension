import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";

export default function initMagikZnika(client: Client) {
    const COLOR = createColorFormat("#ff6347");
    const tag = "magik-znika";
    const prefix = "\n\t[  MAGIK ZNIKA   ]";


    client.Triggers.registerTrigger(
        /^Bialy, zimny plomien ogarnia (.*), w kilka chwil spopielajac .* calkowicie\.$/,
        (line) => {
            return line.prefix(prefix, COLOR).suffix("\n");
        }, tag);
}
