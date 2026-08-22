import Client from "../Client";
import { createColorFormat } from "@modules/core/Colors";
import { EFFECTIVENESS, BALANCE } from "./lib/evaluationConstants";
import { AnsiAwareBuffer } from "@client/ansi/FormatState";

const LABEL_COLOR = createColorFormat("#446fb1");

export default function initWeaponEvaluation(client: Client) {
  const tag = "weapon-evaluation";

  const gripRegex =
    /^Zauwazasz, iz (.+?) (?:jest|sa) przystosowan[yae] do chwytania (w dowolnej rece lub oburacz|w lewej rece lub oburacz|w prawej rece lub oburacz|w dowolnej rece|oburacz|w lewej rece|w prawej rece)(, jednak ty .*)?\.$/;
  const dmgRegex = /^Za (jego|jej|ich) pomoca mozna zadawac rany (.*)\.$/;
  const statsRegex =
    /^Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jak na (.+?) (jest|sa) (on|one|ono|ona) (.*) (wywazony|wywazona|wywazone) i (.*)\.$/;

  client.Triggers.registerTrigger(
    gripRegex,
    (_line, matches) => {
      if (client.suppressItemEvaluation) {
        return null;
      }
      const grip = matches[2];
      let wound = "";
      let weaponType = "";
      let balanceRaw = "";
      let effectRaw = "";

      client.Triggers.registerOneTimeTrigger(
        dmgRegex,
        (_line, matches) => {
          const m2 = matches
          if (m2) {
            wound = m2[2];
          }
          return null;
        },
        tag,
      );

      client.Triggers.registerOneTimeTrigger(
        statsRegex,
        (_line, matches) => {
          const m3 = matches
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

            const output = new AnsiAwareBuffer();

            // Line 1: Typ broni: ... Chwyt: ...
            output.append("Typ broni", LABEL_COLOR);
            output.append(`: ${weaponType.padEnd(pad, " ")} `, {});
            output.append("Chwyt", LABEL_COLOR);
            output.append(`: ${grip}\n`, {});

            // Line 2: Obrazenia: ...
            output.append("Obrazenia", LABEL_COLOR);
            output.append(`: ${wound}\n`, {});

            // Line 3: Wywazenie: ... Skutecznosc: ...
            output.append("Wywazenie", LABEL_COLOR);
            output.append(`: ${balEntry.label.padEnd(pad, " ")} `, {});
            output.append("Skutecznosc", LABEL_COLOR);
            output.append(`: ${effEntry.label}\n`, {});

            // Empty line
            output.append("\n", {});

            // Line 5: Suma: ... Srednia: ...
            output.append("Suma", LABEL_COLOR);
            output.append(`: ${String(sum).padEnd(pad + 5)} `, {});
            output.append("Srednia", LABEL_COLOR);
            output.append(`: ${avg}`, {});

            client.print(output);
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
