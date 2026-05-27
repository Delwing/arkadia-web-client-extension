import initPipe from '@client/scripts/pipe';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

describe('pipe', () => {
  let triggers: Triggers;
  let sendEvent: jest.Mock;

  beforeEach(() => {
    triggers = new Triggers({} as any);
    sendEvent = jest.fn();
    initPipe({ Triggers: triggers, sendEvent } as any);
  });

  const feed = (text: string) => triggers.parseLine(new AnsiAwareBuffer(text), '');

  test('lights the pipe when it is puffed', () => {
    feed('Zapalasz stara podniszczona fajke kilkakrotnie pykajac przy tym, aby podtrzymac zar.');
    expect(sendEvent).toHaveBeenCalledWith('pipeLit', true);
  });

  test('extinguishes the pipe when it burns out', () => {
    feed('Stara podniszczona fajka wypala sie i gasnie.');
    expect(sendEvent).toHaveBeenCalledWith('pipeLit', false);
  });

  test('extinguishes the pipe when you put it out', () => {
    feed('Gasisz stara podniszczona fajke.');
    expect(sendEvent).toHaveBeenCalledWith('pipeLit', false);
  });

  test('matches regardless of the pipe description', () => {
    feed('Zapalasz krotka gliniana fajke kilkakrotnie pykajac przy tym, aby podtrzymac zar.');
    feed('Krotka gliniana fajka wypala sie i gasnie.');
    expect(sendEvent).toHaveBeenNthCalledWith(1, 'pipeLit', true);
    expect(sendEvent).toHaveBeenNthCalledWith(2, 'pipeLit', false);
  });

  test('ignores unrelated lines', () => {
    feed('Zapalasz lampe.');
    feed('Stara fajka lezy na ziemi.');
    expect(sendEvent).not.toHaveBeenCalled();
  });
});
