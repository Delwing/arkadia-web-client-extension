import initWprawionyKamien from '@client/scripts/wprawionyKamien';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
}

describe('wprawiony kamien', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    initWprawionyKamien((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  test('highlights a shrinking gem and pads it with blank lines', () => {
    const line = 'Wprawiony w asymetryczny wulkaniczny mlot naprawde malutki bezbarwny ortoklaz wyraznie sie skurczyl.';
    const result = parse(line);
    expect(result?.text).toBe(`\n${line}\n`);
    const segments = result?.getSegments() ?? [];
    expect(segments.some(seg => seg.state?.foreground)).toBe(true);
  });

  test('highlights a gem vanishing in a flash of light', () => {
    const line = 'Wprawiona w asymetryczny wulkaniczny mlot czarna perla znika w blysku swiatla.';
    const result = parse(line);
    expect(result?.text).toBe(`\n${line}\n`);
    const segments = result?.getSegments() ?? [];
    expect(segments.some(seg => seg.state?.foreground)).toBe(true);
  });

  test('handles neuter and feminine forms of the shrink message', () => {
    const feminine = 'Wprawiona w srebrny pierscien mala czerwona perla lekko sie skurczyla.';
    const neuter = 'Wprawione w srebrny naszyjnik male zielone oczko wyraznie sie skurczylo.';
    expect(parse(feminine)?.text).toBe(`\n${feminine}\n`);
    expect(parse(neuter)?.text).toBe(`\n${neuter}\n`);
  });

  test('leaves unrelated lines alone', () => {
    const line = 'Wprawiony w mlot ortoklaz lsni w swietle.';
    expect(parse(line)?.text).toBe(line);
  });
});
