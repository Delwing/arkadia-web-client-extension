import initUserTriggers from '@client/scripts/userTriggers';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { globalStorage } from '@modules/core/storage';
import { parseArkadiaPatterns } from '@web/options/importArkadia';

/**
 * What the Arkadia web client (Text.parse_patterns) printed for these rules and
 * messages, recorded by running its own code; the imported triggers must print
 * the same through the multiline pass.
 */
const CASES: { name: string; patterns: object[]; message: string; arkadia: string }[] = [
    {
        name: "$$ over a multi-line message, two matches in one line",
        patterns: [{"Regexp": "krzyczy", "Replacement": "[$$]"}],
        message: "Ork krzyczy glosno, Troll krzyczy cicho.\nElf krzyczy.\n",
        arkadia: "Ork [Ork krzyczy glosno, Troll krzyczy cicho.\nElf krzyczy.\n] glosno, Troll [ glosno, Troll krzyczy cicho.\nElf krzyczy.\n] cicho.\nElf [ cicho.\nElf krzyczy.\n].\n",
    },
    {
        name: "^ at every line, $0 and $$",
        patterns: [{"Regexp": "^(\\w+) mowi", "Replacement": "$0: $$"}],
        message: "Ork mowi hej.\nElf mowi czesc.\n",
        arkadia: "Ork: Ork mowi hej.\nElf mowi czesc.\n hej.\nElf:  hej.\nElf mowi czesc.\n czesc.\n",
    },
    {
        name: "%%, %N and %-N",
        patterns: [{"Regexp": "krzyczy (.+)", "Replacement": "%0 (%-1) %1 [%%]"}],
        message: "Ork krzyczy glosno i dlugo.\n",
        arkadia: "Ork krzyczy (glosno i dlugo.) glosno [krzyczy glosno i dlugo.]\n",
    },
    {
        name: "last rule first, the next one sees its output",
        patterns: [{"Regexp": "wilk", "Replacement": "W"}, {"Regexp": "szary", "Replacement": "<$$>"}],
        message: "Widzisz szary wilk i wilk.\n",
        arkadia: "Widzisz <Widzisz szary W i W.\n> W i W.\n",
    },
    {
        name: "an empty replacement, then $$",
        patterns: [{"Regexp": "spam ", "Replacement": ""}, {"Regexp": "x", "Replacement": "{$$}"}],
        message: "spam a x spam b x\n",
        arkadia: "a {a x b x\n} b { b x\n}\n",
    },
    {
        name: "a pattern written against escaped quotes",
        patterns: [{"Regexp": "mowi: &quot;(\\w+)&quot;", "Replacement": "MOWI $0"}],
        message: "Elf mowi: \"hej\" i idzie.\n",
        arkadia: "Elf MOWI hej i idzie.\n",
    },
];

function runImported(patterns: object[], message: string): string | undefined {
    const client: any = { Triggers: new Triggers({} as any), on() {}, off() {}, sendEvent() {}, sendCommand() {}, FunctionalBind: { set() {} } };
    initUserTriggers(client);
    globalStorage.set('triggers', parseArkadiaPatterns(JSON.stringify({ patterns })).imported);
    return client.Triggers.parseMultiline(new AnsiAwareBuffer(message), '')?.text;
}

describe('imported Arkadia text transformations', () => {
    it.each(CASES)('match the Arkadia client: ', ({ patterns, message, arkadia }) => {
        expect(runImported(patterns, message)).toBe(arkadia);
    });
});
