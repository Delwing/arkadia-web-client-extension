import initSpellScrolls from "@client/scripts/spellScrolls";
import Triggers from "@client/Triggers";
import { AnsiAwareBuffer } from "@client/ansi/FormatState";

class FakeClient {
    Triggers = new Triggers({} as unknown as any);
}

describe("spell scrolls", () => {
    let parse: (line: string) => AnsiAwareBuffer | null;

    beforeEach(() => {
        const client = new FakeClient();
        initSpellScrolls(client as unknown as any);
        parse = (line) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), "");
    });

    test("highlights the spell name", () => {
        const line = "Opisuja one kolejne zwroty i gesty skladajace sie na rytual inkantacji czaru nekromanckiej magii smierci 'klatwa dusz'.";
        const out = parse(line)!;
        const idx = line.indexOf("klatwa dusz");
        expect(out.text).toBe(line);
        expect(out.getStateAt(idx)?.bold).toBe(true);
        expect(out.getStateAt(idx - 1)?.bold).toBeFalsy();
    });

    test.each([
        ["bardzo duzo trudnosci", 1],
        ["duzo trudnosci", 2],
        ["troche trudnosci", 3],
        ["niewiele trudnosci", 4],
        ["bardzo niewiele trudnosci", 5],
    ])("labels %s as level %i", (phrase, level) => {
        const out = parse(`Wydaje ci sie, ze odczytanie tego zwoju sprawiloby ci ${phrase}.`)!;
        expect(out.text).toContain(`[${level}/6]`);
    });

    test("labels the easiest level", () => {
        const out = parse("Wydaje ci sie, ze nie mialbys najmniejszych trudnosci z odczytaniem tego zwoju.")!;
        expect(out.text).toContain("[6/6]");
    });

    test("leaves the value line alone", () => {
        const out = parse("Wydaje ci sie, ze nie ma wiekszej wartosci.")!;
        expect(out.text).toBe("Wydaje ci sie, ze nie ma wiekszej wartosci.");
    });
});
