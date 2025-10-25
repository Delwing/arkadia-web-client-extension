import initGuildPostfix from "../src/scripts/guildPostfix";
import Triggers from "../src/Triggers";
import { color, findClosestColor, RESET, setXtermPalette } from "../src/Colors";

describe("guildPostfix", () => {
  class FakeClient {
    Triggers = new Triggers(({} as unknown) as any);
    addEventListener = jest.fn();
    postfix = jest.fn((raw: string, postfix: string) => raw + postfix);
  }

  const enemyLine = "Noszony przez niego pierscien czlonkow Kupcow.";

  let client: FakeClient;
  let parse: (line: string) => string;
  let settingsHandler: ((event: { detail: { enemyGuilds?: string[]; guildColors?: Record<string, string | undefined> } }) => void) | undefined;
  let uiSettingsHandler: ((event: CustomEvent) => void) | undefined;

  beforeEach(() => {
    client = new FakeClient();
    initGuildPostfix((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, "");
    settingsHandler = client.addEventListener.mock.calls.find(([event]) => event === 'settings')?.[1] as ((event: { detail: { enemyGuilds?: string[]; guildColors?: Record<string, string | undefined> } }) => void) | undefined;
    uiSettingsHandler = client.addEventListener.mock.calls.find(([event]) => event === 'uiSettings')?.[1];
  });

  afterEach(() => {
    jest.clearAllMocks();
    setXtermPalette('arkadia');
  });

  function emitSettings(detail: { enemyGuilds?: string[]; guildColors?: Record<string, string | undefined> }) {
    settingsHandler?.({ detail });
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

  test('updates enemy color after palette change', () => {
    emitSettings({ enemyGuilds: ["CKN"] });
    const before = parse(enemyLine);
    const initialRed = findClosestColor('#ff0000');
    expect(before).toContain(color(initialRed) + " [CKN]" + RESET);

    setXtermPalette('proper');
    uiSettingsHandler?.({ detail: { xtermPalette: 'proper' } } as any);

    const after = parse(enemyLine);
    const updatedRed = findClosestColor('#ff0000');
    expect(after).toContain(color(updatedRed) + " [CKN]" + RESET);
  });
});
