import initGuildPostfix from "@client/scripts/guildPostfix";
import Triggers from "@client/Triggers";
import { color, findClosestColor, RESET } from "@modules/core/Colors";

describe("guildPostfix", () => {
  class FakeClient {
    Triggers = new Triggers(({} as unknown) as any);
    on = jest.fn();
    postfix = jest.fn((raw: string, postfix: string) => raw + postfix);
  }

  const enemyLine = "Noszony przez niego pierscien czlonkow Kupcow.";

  let client: FakeClient;
  let parse: (line: string) => string;
  let settingsHandler: ((detail: { enemyGuilds?: string[]; guildColors?: Record<string, string | undefined> }) => void) | undefined;

  beforeEach(() => {
    client = new FakeClient();
    initGuildPostfix((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, "");
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
    const green = findClosestColor(greenHex);
    expect(result).toContain(color(green) + " [CKN]" + RESET);
  });

  test("colors enemy guild postfix red", () => {
    emitSettings({ enemyGuilds: ["CKN"] });
    const result = parse(enemyLine);
    const red = findClosestColor("#ff0000");
    expect(result).toContain(color(red) + " [CKN]" + RESET);
  });
});
