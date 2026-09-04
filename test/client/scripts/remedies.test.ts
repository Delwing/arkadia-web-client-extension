import initRemedies from '@client/scripts/remedies';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { registerHerbManagerProvider } from '@modules/core/herbManagerProvider';

function setup(carried: Record<string, number> = {}) {
  registerHerbManagerProvider({ getBags: () => ({ '1': { herbs: carried } }) } as any);

  const triggers = new Triggers({} as any);
  const printed: AnsiAwareBuffer[] = [];
  const sent: string[] = [];
  const aliases: { pattern: RegExp; callback: Function }[] = [];
  const client = {
    Triggers: triggers,
    print: (buffer: AnsiAwareBuffer) => printed.push(buffer),
    sendCommand: (command: string) => sent.push(command),
  };

  initRemedies(client as any, aliases);

  return {
    printed,
    sent,
    aliases,
    feed: (text: string) => triggers.parseLine(new AnsiAwareBuffer(text), ''),
  };
}

function clickLink(buffer: AnsiAwareBuffer, description: string) {
  const index = buffer.text.indexOf(description);
  const state = buffer.getStateAt(index) as any;
  state?.hyperlink?.onClick?.({} as MouseEvent);
}

describe('remedies', () => {
  test('prints remedies for an ailment', () => {
    const { feed, printed } = setup();
    feed('Cierpisz na chorobe pluc.');
    expect(printed).toHaveLength(1);
    expect(printed[0].text).toContain('powachaj chaber');
  });

  test('prints remedies for both ailments on one line', () => {
    const { feed, printed } = setup();
    feed('Cierpisz na chorobe pluc i trad.');
    expect(printed).toHaveLength(2);
    expect(printed[0].text).toContain('powachaj chaber');
    expect(printed[1].text).toContain('wetrzyj bylice piolun');
  });

  test('handles the remaining ailment phrasings', () => {
    const { feed, printed } = setup();
    feed('Jestes zatruty gadzim jadem.');
    feed('Jestes chory na chorobe skory.');
    feed('Doskwieraja ci pchly.');
    feed('Jestes trzezwy, ale masz potwornego kaca.');
    expect(printed.map(p => p.text)).toEqual([
      expect.stringContaining('zjedz barwinka'),
      expect.stringContaining('rozkrusz us.jaskier'),
      expect.stringContaining('przyloz bagno'),
      expect.stringContaining('przezuj bulawinke'),
    ]);
  });

  test('ailments without remedies print nothing', () => {
    const { feed, printed } = setup();
    feed('Jestes zatruty jadem wija.');
    expect(printed).toHaveLength(0);
  });

  test('ignores unrelated lines', () => {
    const { feed, printed } = setup();
    feed('Cierpisz na brak snu.');
    feed('Jestes trzezwy.');
    expect(printed).toHaveLength(0);
  });

  test('carried herbs are clickable and send the /zi command', () => {
    const { feed, printed, sent } = setup({ chaber: 2 });
    feed('Cierpisz na chorobe pluc.');
    clickLink(printed[0], 'powachaj chaber');
    expect(sent).toEqual(['/zi powachaj chaber']);
  });

  test('herbs that are not carried are not clickable', () => {
    const { feed, printed, sent } = setup();
    feed('Cierpisz na chorobe pluc.');
    clickLink(printed[0], 'powachaj chaber');
    expect(sent).toEqual([]);
  });

  test('/leczenie lists every ailment', () => {
    const { aliases, printed } = setup();
    const alias = aliases.find(a => a.pattern.test('/leczenie'));
    expect(alias).toBeDefined();

    alias!.callback();
    expect(printed).toHaveLength(1);
    const text = printed[0].text;
    expect(text).toContain('CHOROBA PLUC:');
    expect(text).toContain('JAD WIJA:');
    expect(text).toContain('powachaj chaber');
  });
});
