import Client from "../Client";
import { saveOdmiana, type Odmiana } from "@modules/data/odmianaStore";

const TAG = "odmiana-parser";

const CASES = ["Mianownik", "Dopelniacz", "Celownik", "Biernik", "Narzednik", "Miejscownik"] as const;

/**
 * Remembers what `odmien <przedmiot>` prints, so a declension seen once is kept.
 * Passive only: it never sends `odmien` itself.
 *
 *   Zamkniety skorzany plecak odmienia sie nastepujaco:
 *
 *     Mianownik: zamkniety skorzany plecak,
 *    Dopelniacz: zamknietego skorzanego plecaka,
 *    ...
 *   Miejscownik: zamknietym skorzanym plecaku.
 *
 * The cases must arrive in order; anything else in between drops the reply.
 */
export default function initOdmiana(client: Client): void {
    let pending: Partial<Record<(typeof CASES)[number], string>> | null = null;
    let expected = 0;

    client.Triggers.registerTrigger(/^.+ odmienia(?:ja)? sie nastepujaco:$/, (line) => {
        pending = {};
        expected = 0;
        return line;
    }, TAG);

    client.Triggers.registerTrigger(
        /^\s*(Mianownik|Dopelniacz|Celownik|Biernik|Narzednik|Miejscownik): (.+?)[,.]$/,
        (line, m) => {
            if (!pending) return line;
            if (m[1] !== CASES[expected]) {
                pending = null;
                return line;
            }
            pending[CASES[expected]] = m[2].trim().toLowerCase();
            expected++;
            if (expected === CASES.length) {
                const odmiana: Odmiana = {
                    mianownik: pending.Mianownik!,
                    dopelniacz: pending.Dopelniacz!,
                    celownik: pending.Celownik!,
                    biernik: pending.Biernik!,
                    narzednik: pending.Narzednik!,
                    miejscownik: pending.Miejscownik!,
                };
                pending = null;
                void saveOdmiana(odmiana);
            }
            return line;
        },
        TAG,
    );
}
