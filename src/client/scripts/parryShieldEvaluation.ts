import Client from "../Client";
import { colorString, findClosestColor } from "@modules/core/Colors";
import { EFFECTIVENESS } from "./evaluationConstants";

const LABEL_COLOR = findClosestColor("#446fb1");

export default function initParryShieldEvaluation(client: Client) {
  const tag = "parry-shield-evaluation";
  const regex = /^Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest ona? (.*) w parowaniu ciosow\.$/;

  client.Triggers.registerTrigger(
    regex,
    (triggerLine) => {
      if (client.suppressItemEvaluation) {
        return null;
      }
      const m = triggerLine.matches.matches;
      if (!m) return triggerLine;
      const parryText = m[1].trim();
      const key = Object.keys(EFFECTIVENESS).find((k) =>
        parryText.toLowerCase().startsWith(k),
      );
      if (!key) return null;
      const parry = EFFECTIVENESS[key];
      const pad = 15;
      const line = `${colorString("Typ zbroi", LABEL_COLOR)}: ${"puklerz".padEnd(pad, " ")}${colorString("Parowanie", LABEL_COLOR)}: ${parry.label}`;
      client.print(line);
      return null;
    },
    tag,
  );
}
