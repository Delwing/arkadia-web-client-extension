import Client from "../Client";
import { colorString, findClosestColor } from "@modules/core/Colors";
import { EFFECTIVENESS, BALANCE } from "./evaluationConstants";

const LABEL_COLOR = findClosestColor("#446fb1");

export default function initWeaponEvaluation(client: Client) {
  const tag = "weapon-evaluation";

  const gripRegex =
    /^Zauwazasz, iz (.+?) (?:jest|sa) przystosowan[yae] do chwytania (w dowolnej rece lub oburacz|w lewej rece lub oburacz|w prawej rece lub oburacz|w dowolnej rece|oburacz|w lewej rece|w prawej rece)(, jednak ty .*)?\.$/;
  const dmgRegex = /^Za (jego|jej|ich) pomoca mozna zadawac rany (.*)\.$/;
  const statsRegex =
    /^Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jak na (.+?) (jest|sa) (on|one|ono|ona) (.*) (wywazony|wywazona|wywazone) i (.*)\.$/;

  client.Triggers.registerTrigger(
    gripRegex,
    (triggerLine) => {
      if (client.suppressItemEvaluation) {
        return null;
      }
      const m = triggerLine.matches.matches;
      if (!m) return triggerLine;
      const grip = m[2];
      let wound = "";
      let weaponType = "";
      let balanceRaw = "";
      let effectRaw = "";

      client.Triggers.registerOneTimeTrigger(
        dmgRegex,
        (triggerLine) => {
          const m2 = triggerLine.matches.matches;
          if (m2) {
            wound = m2[2];
          }
          return null;
        },
        tag,
      );

      client.Triggers.registerOneTimeTrigger(
        statsRegex,
        (triggerLine) => {
          const m3 = triggerLine.matches.matches;
          if (!m3) return triggerLine;
          weaponType = m3[1];
          balanceRaw = m3[4].trim();
          effectRaw = m3[6].trim();

          const balEntry = BALANCE[balanceRaw.toLowerCase()];
          const effEntry =
            EFFECTIVENESS[
              Object.keys(EFFECTIVENESS).find((k) =>
                effectRaw.toLowerCase().startsWith(k),
              ) || ""
            ];

          if (balEntry && effEntry) {
            const sum = balEntry.value + effEntry.value;
            const avg = sum / 2;
            const pad = 15;
            const lines = [
              `${colorString("Typ broni", LABEL_COLOR)}: ${weaponType.padEnd(pad, " ")} ${colorString("Chwyt", LABEL_COLOR)}: ${grip}`,
              `${colorString("Obrazenia", LABEL_COLOR)}: ${wound}`,
              `${colorString("Wywazenie", LABEL_COLOR)}: ${balEntry.label.padEnd(pad, " ")} ${colorString("Skutecznosc", LABEL_COLOR)}: ${effEntry.label}`,
              "",
              `${colorString("Suma", LABEL_COLOR)}: ${String(sum).padEnd(pad + 5)} ${colorString("Srednia", LABEL_COLOR)}: ${avg}`,
            ];
            client.print(lines.join("\n"));
          }
          return null;
        },
        tag,
      );

      return null;
    },
    tag,
  );
}
