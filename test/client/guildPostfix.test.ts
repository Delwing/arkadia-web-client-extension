import initGuildPostfix from "@client/scripts/guildPostfix";
import Triggers from "@client/Triggers";
import { AnsiAwareBuffer } from "@client/ansi/FormatState";

describe("guildPostfix", () => {
  class FakeClient {
    Triggers = new Triggers(({} as unknown) as any);
    on = jest.fn();
    postfix = jest.fn((raw: string, postfix: string) => raw + postfix);
  }

  const enemyLine = "Noszony przez niego pierscien czlonkow Kupcow.";

  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;
  let settingsHandler: ((detail: { enemyGuilds?: string[]; guildColors?: Record<string, string | undefined> }) => void) | undefined;

  beforeEach(() => {
    client = new FakeClient();
    initGuildPostfix((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), "");
    settingsHandler = client.on.mock.calls[0]?.[1] as typeof settingsHandler;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function emitSettings(detail: { enemyGuilds?: string[]; guildColors?: Record<string, string | undefined> }) {
    settingsHandler?.(detail);
  }

  test("colors guild postfix with configured color", () => {
    const greenHex = "#00ff00";
    emitSettings({ guildColors: { CKN: greenHex }, enemyGuilds: [] });
    const result = parse(enemyLine);
    expect(result?.text).toContain("[CKN]");
  });

  test("colors enemy guild postfix red", () => {
    emitSettings({ enemyGuilds: ["CKN"] });
    const result = parse(enemyLine);
    expect(result?.text).toContain("[CKN]");
  });
});
