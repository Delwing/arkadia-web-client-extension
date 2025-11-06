import initParryShieldEvaluation from '@client/scripts/parryShieldEvaluation';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers({} as unknown as any);
  print = jest.fn();
}

describe('parry shield evaluation trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    initParryShieldEvaluation(client as unknown as any);
    parse = (line: string) =>
      Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  test('parses parry line', () => {
    parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest ona fantastycznie skuteczna w parowaniu ciosow.');

    const output = client.print.mock.calls[0][0]?.text;
    expect(output).toContain('Typ zbroi: puklerz');
    expect(output).toContain('Parowanie: [14/14]');
    expect(output).not.toContain('Suma');
    expect(output).not.toContain('Srednia');
  });
});
