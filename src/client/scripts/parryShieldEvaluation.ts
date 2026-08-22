import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";
import {EFFECTIVENESS} from "./lib/evaluationConstants";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";

const LABEL_COLOR = createColorFormat("#446fb1");

export default function initParryShieldEvaluation(client: Client) {
    const tag = "parry-shield-evaluation";
    const regex = /^Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest ona? (.*) w parowaniu ciosow\.$/;

    client.Triggers.registerTrigger(
        regex,
        (_line, matches) => {
            if (client.suppressItemEvaluation) {
                return null;
            }
            const parryText = matches[1].trim();
            const key = Object.keys(EFFECTIVENESS).find((k) =>
                parryText.toLowerCase().startsWith(k),
            );
            if (!key) return null;
            const parry = EFFECTIVENESS[key];
            const pad = 15;
            const output = new AnsiAwareBuffer();
            output.append("Typ zbroi", LABEL_COLOR);
            output.append(`: ${"puklerz".padEnd(pad, " ")}`, {});
            output.append("Parowanie", LABEL_COLOR);
            output.append(`: ${parry.label}\n`, {});
            client.print(output);
            return null;
        },
        tag,
    );
}
