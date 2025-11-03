import {parseBlowtorch} from "../../src/web/options/importBlowtorch";

describe("parseBlowtorch", () => {
    it("parses aliases with parameters", () => {
        const xml = `<blowtorch xmlversion="2"><aliases><alias pre="test" post="cmd" enabled="true"/><alias pre="say" post="say $1 $2" enabled="true"/></aliases></blowtorch>`;
        const res = parseBlowtorch(xml);
        expect(res).toEqual([
            { pattern: "^test$", command: "cmd" },
            { pattern: "^say\\s+(\\w+)\\s+(\\w+)$", command: "say $1 $2" }
        ]);
    });
});
