import initWearUsed from '@client/scripts/wearUsed';
import Triggers, { stripAnsiCodes } from '@client/Triggers';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
}

describe('wear used trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    client = new FakeClient();
    initWearUsed((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
  });

  test('replaces wear description', () => {
    const line = 'Ubranie to cos wyglada na troche znoszone.';
    const result = stripAnsiCodes(parse(line));
    expect(result).toBe('Ubranie to cos wyglada na troche znoszone. [3/5]');
  });

  test('handles feminine form', () => {
    const line = 'Ubranie to cos wyglada na prawie calkiem znoszona.';
    const result = stripAnsiCodes(parse(line));
    expect(result).toBe('Ubranie to cos wyglada na prawie calkiem znoszona. [2/5]');
  });
});
