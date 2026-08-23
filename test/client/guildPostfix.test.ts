import initGuildPostfix from "@client/scripts/guildPostfix";
import Triggers from "@client/Triggers";
import { AnsiAwareBuffer } from "@client/ansi/FormatState";
import { characterStorage } from "@modules/core/storage";
import { setTestSettings } from "./helpers/testSettings";
import { FakeClientBase } from './helpers/fakeClient';

describe("guildPostfix", () => {
  class FakeClient extends FakeClientBase {
    Triggers = new Triggers(({} as unknown) as any);
    on = jest.fn();
    postfix = jest.fn((raw: string, postfix: string) => raw + postfix);
  }

  const enemyLine = "Noszony przez niego pierscien czlonkow Kupcow.";

  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    localStorage.clear();
    characterStorage.setCharacter('TestChar');
    client = new FakeClient();
    initGuildPostfix((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), "living.long");
  });

  afterEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test("colors guild postfix with configured color", () => {
    const greenHex = "#00ff00";
    setTestSettings({ guildColors: { CKN: greenHex }, enemyGuilds: [] });
    const result = parse(enemyLine);
    expect(result?.text).toContain("[CKN]");
  });

  test("colors enemy guild postfix red", () => {
    setTestSettings({ enemyGuilds: ["CKN"] });
    const result = parse(enemyLine);
    expect(result?.text).toContain("[CKN]");
  });
});
