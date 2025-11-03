import Client from "../Client";
import { colorString, findClosestColor } from "@modules/core/Colors";
import { SKIP_LINE } from "../ControlConstants";
import { ARMOR_QUALITY, EFFECTIVENESS } from "./evaluationConstants";

const LABEL_COLOR = findClosestColor("#446fb1");

const DAMAGE_MAP: Record<string, keyof Protection> = {
  klutymi: "klute",
  cietymi: "ciete",
  obuchowymi: "obuchowe",
};

interface Protection {
  klute: string;
  ciete: string;
  obuchowe: string;
}

function extractProtection(
  text: string,
): { prot: Protection; parry?: string } | undefined {
  let parry: string | undefined;
  if (text.includes("Ponadto jest")) {
    const parryMatch = text.match(/Ponadto jest (.*) w parowaniu ciosow\./);
    if (parryMatch) {
      parry = parryMatch[1].trim();
      text = text.replace(parryMatch[0], "").trim();
    }
  }

  const p1 = text.match(
    /(.*) przed obrazeniami (klutymi|cietymi|obuchowymi), (.*) przed (klutymi|cietymi|obuchowymi) i (.*) przed (klutymi|cietymi|obuchowymi)\./,
  );
  if (p1) {
    const prot: Protection = { klute: "", ciete: "", obuchowe: "" };
    prot[DAMAGE_MAP[p1[2]]] = p1[1].trim();
    prot[DAMAGE_MAP[p1[4]]] = p1[3].trim();
    prot[DAMAGE_MAP[p1[6]]] = p1[5].trim();
    return { prot, parry };
  }

  const p2 = text.match(
    /(.*) przed obrazeniami (klutymi|cietymi|obuchowymi), (klutymi|cietymi|obuchowymi) i (klutymi|cietymi|obuchowymi)\./,
  );
  if (p2) {
    const prot: Protection = { klute: "", ciete: "", obuchowe: "" };
    const quality = p2[1].trim();
    [p2[2], p2[3], p2[4]].forEach((t) => {
      prot[DAMAGE_MAP[t]] = quality;
    });
    return { prot, parry };
  }

  const p3 = text.match(
    /(.*) przed obrazeniami (cietymi|klutymi|obuchowymi) i (klutymi|cietymi|obuchowymi) oraz (.*) przed (klutymi|cietymi|obuchowymi)\./,
  );
  if (p3) {
    const prot: Protection = { klute: "", ciete: "", obuchowe: "" };
    const q1 = p3[1].trim();
    prot[DAMAGE_MAP[p3[2]]] = q1;
    prot[DAMAGE_MAP[p3[3]]] = q1;
    prot[DAMAGE_MAP[p3[5]]] = p3[4].trim();
    return { prot, parry };
  }

  const p4 = text.match(
    /(.*) przed obrazeniami (klutymi|cietymi|obuchowymi)\./,
  );
  if (p4) {
    const quality = p4[1].trim();
    const prot: Protection = {
      klute: quality,
      ciete: quality,
      obuchowe: quality,
    };
    prot[DAMAGE_MAP[p4[2]]] = quality;
    return { prot, parry };
  }

  return undefined;
}

export default function initArmorEvaluation(client: Client) {
  const tag = "armor-evaluation";
  const mainRegex =
    /^Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze (jak na (lekka|srednia|ciezka) zbroje (chroni|chronia)|(chroni|chronia)) (on|ona|one) (.*)/;

  client.Triggers.registerTrigger(
    mainRegex,
    (_r, _l, m) => {
      if (client.suppressItemEvaluation) {
        return SKIP_LINE;
      }
      const equipmentType = m[2] ? m[2] : "tarcza";
      const desc = m[6].trim();
      const extracted = extractProtection(desc);
      if (!extracted) return SKIP_LINE;
      const { prot, parry } = extracted;
      const k = ARMOR_QUALITY[prot.klute.toLowerCase()];
      const c = ARMOR_QUALITY[prot.ciete.toLowerCase()];
      const o = ARMOR_QUALITY[prot.obuchowe.toLowerCase()];
      if (!k || !c || !o) return SKIP_LINE;
      const sum = k.value + c.value + o.value;
      const avg = Math.round((sum / 3) * 100) / 100;
      const pad = 15;
      const lines: string[] = [
        `${colorString("Typ zbroi", LABEL_COLOR)}: ${equipmentType.padEnd(pad, " ")}${colorString("Klute", LABEL_COLOR)}: ${k.label}`,
        `${colorString("Ciete", LABEL_COLOR)}:     ${c.label.padEnd(pad, " ")}${colorString("Obuchowe", LABEL_COLOR)}: ${o.label}`,
      ];

      if (parry) {
        const key = Object.keys(EFFECTIVENESS).find((k) =>
          parry.toLowerCase().startsWith(k),
        );
        if (key) {
          const p = EFFECTIVENESS[key];
          lines.push(`${colorString("Parowanie", LABEL_COLOR)}: ${p.label}`);
        }
      }

      lines.push(
        "",
        `${colorString("Suma", LABEL_COLOR)}: ${String(sum).padEnd(pad + 5)}${colorString("Srednia", LABEL_COLOR)}: ${avg}`,
      );
      client.print(lines.join("\n"));
      return SKIP_LINE;
    },
    tag,
  );
}
