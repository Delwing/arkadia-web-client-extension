import Client from "../Client";
import { colorString, findClosestColor } from "../Colors";
import { SKIP_LINE } from "../ControlConstants";
import { EFFECTIVENESS } from "./evaluationConstants";

const LABEL_COLOR = findClosestColor("#446fb1");

export default function initParryShieldEvaluation(client: Client) {
  const tag = "parry-shield-evaluation";
  const regex = /^Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest ona? (.*) w parowaniu ciosow\.$/;

  client.Triggers.registerTrigger(
    regex,
    (_r, _l, m) => {
      const parryText = m[1].trim();
      const key = Object.keys(EFFECTIVENESS).find((k) =>
        parryText.toLowerCase().startsWith(k),
      );
      if (!key) return SKIP_LINE;
      const parry = EFFECTIVENESS[key];
      const pad = 15;
      const line = `${colorString("Typ zbroi", LABEL_COLOR)}: ${"puklerz".padEnd(pad, " ")}${colorString("Parowanie", LABEL_COLOR)}: ${parry.label}`;
      client.print(line);
      return SKIP_LINE;
    },
    tag,
  );
}
