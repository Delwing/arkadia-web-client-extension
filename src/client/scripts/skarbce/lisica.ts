/**
 * Lisica - wystukiwanie hasla na drzwiach.
 *
 * Wiadomosc ze spotkania niesie aktualne haslo ("aktualnie to: 1-9-5-2").
 * Haslo jest zapamietywane, a alias /lisica wystukuje je grupami: najpierw
 * tyle pukniec, ile wynosi pierwsza cyfra, a po odpowiedzi drzwi kolejna
 * grupa trafia pod funkcjonalny bind.
 */
import Client from "@client/Client.ts";
import {characterStorage} from "@modules/core/storage";
import {colorString, createColorFormat} from "@modules/core/Colors";

const TAG = "skarbce-lisica";
const KNOCK = "zapukaj w drzwi";

/** Linia z wiadomosci, ktora niesie aktualne haslo. */
const CODE_PATTERN = /hasl\w*[^.]*aktualnie to:\s*([0-9](?:\s*[-,. ]\s*[0-9])*)/i;
/** Drzwi odpowiadaja ta linia na kazde pukniecie. */
const KNOCK_ECHO = "Niewielkie drzwi wydaja z siebie taki dzwiek, jakby ktos pukal.";
/** Ile czekac na brakujace odpowiedzi drzwi, zanim przejdziemy do kolejnej cyfry. */
const ECHO_TIMEOUT = 1500;

const INFO = createColorFormat("#ffd787");

/** Haslo moze przyjsc jako "1-9-5-2", "1952", "1 9 5 2" - liczy sie sama kolejnosc cyfr. */
export function parseCode(raw: string | null | undefined): number[] {
    return (raw ?? "").match(/[0-9]/g)?.map(Number) ?? [];
}

export function formatCode(code: number[]): string {
    return code.join("-");
}

/** Opis grupy pukniec pokazywany przy bindzie, np. "zapukaj w drzwi x9 (2/4)". */
export function knockLabel(count: number, index: number, total: number): string {
    const command = count > 1 ? `${KNOCK} x${count}` : KNOCK;
    return `${command} (${index + 1}/${total})`;
}

export default function initLisica(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const list = aliases ?? client.aliases;

    let code: number[] = [];
    let step = 0;
    /** Ile odpowiedzi drzwi spodziewamy sie po biezacej grupie pukniec. */
    let awaiting = 0;
    let heard = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function stopTimer() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    }

    function reset() {
        code = [];
        step = 0;
        awaiting = 0;
        heard = 0;
        stopTimer();
    }

    /** Bind czyscimy tylko wtedy, gdy nadal wisi na nim nasze pukanie. */
    function clearOwnBind() {
        const current = client.FunctionalBind.getCategory("default")?.getPrintable();
        if (current?.startsWith(KNOCK)) {
            client.FunctionalBind.clearCategory("default");
        }
    }

    function knockStep() {
        stopTimer();
        while (step < code.length && code[step] <= 0) step++;
        if (step >= code.length) {
            reset();
            return;
        }
        awaiting = code[step];
        heard = 0;
        for (let i = 0; i < awaiting; i++) {
            client.sendCommand(KNOCK);
        }
    }

    function advance() {
        stopTimer();
        awaiting = 0;
        heard = 0;
        const total = code.length;
        step++;
        while (step < total && code[step] <= 0) step++;
        if (step >= total) {
            reset();
            clearOwnBind();
            client.println(colorString("Haslo wystukane w calosci.", INFO));
            return;
        }
        client.FunctionalBind.set(knockLabel(code[step], step, total), () => knockStep(), true);
    }

    function start(arg: string) {
        const fromArg = parseCode(arg);
        if (fromArg.length > 0) {
            characterStorage.set("lisica_code", formatCode(fromArg));
        }
        const wanted = fromArg.length > 0 ? fromArg : parseCode(characterStorage.get("lisica_code"));
        reset();
        clearOwnBind();
        if (wanted.length === 0) {
            client.println(colorString("Nie znam hasla do drzwi. Uzyj np. /lisica 1-9-5-2", INFO));
            return;
        }
        code = wanted;
        step = 0;
        client.println(colorString(`Wystukuje haslo ${formatCode(code)}.`, INFO));
        knockStep();
    }

    client.Triggers.registerTrigger(CODE_PATTERN, (line, matches) => {
        const parsed = parseCode(matches?.[1]);
        if (parsed.length > 0) {
            characterStorage.set("lisica_code", formatCode(parsed));
            client.println(colorString(`Zapamietano haslo do drzwi: ${formatCode(parsed)} (wystukasz je przez /lisica).`, INFO));
        }
        return line;
    }, TAG);

    client.Triggers.registerTrigger(KNOCK_ECHO, (line) => {
        if (awaiting > 0) {
            heard++;
            if (heard >= awaiting) {
                advance();
            } else {
                // Gdy czesc pukniec przepadnie, i tak proponujemy kolejna cyfre.
                stopTimer();
                timer = setTimeout(() => advance(), ECHO_TIMEOUT);
            }
        }
        return line;
    }, TAG);

    list.push({
        pattern: /^\/lisica(?:\s+(.*))?$/,
        callback: (matches: RegExpMatchArray) => {
            const arg = (matches[1] ?? "").trim();
            if (/^(stop|koniec|anuluj)$/i.test(arg)) {
                reset();
                clearOwnBind();
                client.println(colorString("Wystukiwanie hasla przerwane.", INFO));
                return;
            }
            start(arg);
        },
    });
}
