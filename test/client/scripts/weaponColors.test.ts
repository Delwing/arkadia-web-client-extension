import initWeaponColors from '@client/scripts/weaponColors';
import Triggers from '@client/Triggers';
import { colorString } from '@modules/core/Colors';
import { MAGICS_COLOR } from '@client/constants/colors';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
}

describe('weapon colors trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    initWeaponColors((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  test('colors single weapon', () => {
    const line = 'Trzymasz oburacz stalowy miecz.';
    const result = parse(line);
    expect(result?.text).toBe(line);
    expect(result?.text).toContain('stalowy miecz');
    const segments = result?.getSegments();
    expect(segments?.some(seg => seg.state?.foreground)).toBe(true);
  });

  test('colors two weapons', () => {
    const line = 'Trzymasz stalowy miecz w lewej rece oraz drewniana tarcze w prawej rece.';
    const result = parse(line);
    expect(result?.text).toBe(line);
    expect(result?.text).toContain('stalowy miecz');
    expect(result?.text).toContain('drewniana tarcze');
    const segments = result?.getSegments();
    expect(segments?.some(seg => seg.state?.foreground)).toBe(true);
  });

  test('colors identical weapons in both hands', () => {
    const line = 'Trzymasz zebaty szeroki noz bojowy w lewej rece oraz zebaty szeroki noz bojowy w prawej rece.';
    const weapon = 'zebaty szeroki noz bojowy';
    const result = parse(line);
    expect(result?.text).toBe(line);
    expect(result?.text).toContain(weapon);
    const segments = result?.getSegments();
    expect(segments?.some(seg => seg.state?.foreground)).toBe(true);
  });

  test('keeps magic color for single weapon', () => {
    const line = 'Trzymasz oburacz stalowy miecz.';
    // Create a buffer with magic-colored weapon text
    const coloredWeapon = colorString('stalowy miecz', MAGICS_COLOR);
    const precoloredBuffer = new AnsiAwareBuffer('Trzymasz oburacz ');
    precoloredBuffer.insertBuffer(precoloredBuffer.length, coloredWeapon);
    precoloredBuffer.insert(precoloredBuffer.length, '.');
    const result = Triggers.prototype.parseLine.call(client.Triggers, precoloredBuffer, '');
    expect(result?.text).toBe(line);
    const segments = result?.getSegments();
    expect(segments?.some(seg => seg.state?.foreground)).toBe(true);
  });

  test('keeps magic color for one of two weapons', () => {
    const line = 'Trzymasz stalowy miecz w lewej rece oraz drewniana tarcze w prawej rece.';
    // Create a buffer with magic-colored weapon text
    const coloredWeapon = colorString('stalowy miecz', MAGICS_COLOR);
    const precoloredBuffer = new AnsiAwareBuffer('Trzymasz ');
    precoloredBuffer.insertBuffer(precoloredBuffer.length, coloredWeapon);
    precoloredBuffer.insert(precoloredBuffer.length, ' w lewej rece oraz drewniana tarcze w prawej rece.');
    const result = Triggers.prototype.parseLine.call(client.Triggers, precoloredBuffer, '');
    expect(result?.text).toBe(line);
    expect(result?.text).toContain('drewniana tarcze');
    const segments = result?.getSegments();
    expect(segments?.some(seg => seg.state?.foreground)).toBe(true);
  });

  test('colors weapon in scabbard', () => {
    const line = 'Masz do pasa przypieta pochwe, zawierajaca stalowy miecz.';
    const result = parse(line);
    expect(result?.text).toBe(line);
    expect(result?.text).toContain('stalowy miecz');
    const segments = result?.getSegments();
    expect(segments?.some(seg => seg.state?.foreground)).toBe(true);
  });

  test('colors weapon stuck in scabbard', () => {
    const line = 'Masz do pasa przypieta pochwe z tkwiacym w niej stalowym mieczem.';
    const result = parse(line);
    expect(result?.text).toBe(line);
    expect(result?.text).toContain('stalowym mieczem');
    const segments = result?.getSegments();
    expect(segments?.some(seg => seg.state?.foreground)).toBe(true);
  });
});
