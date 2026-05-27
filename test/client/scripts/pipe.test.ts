import initPipe from '@client/scripts/pipe';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';

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

  test('matches custom pipes with adjectives after the noun', () => {
    feed('Zapalasz kosciana fajke zwienczona osmolonymi piorami kilkakrotnie pykajac przy tym, aby podtrzymac zar.');
    feed('Kosciana fajka zwienczona osmolonymi piorami wypala sie i gasnie.');
    feed('Gasisz kosciana fajke zwienczona osmolonymi piorami.');
    expect(sendEvent).toHaveBeenNthCalledWith(1, 'pipeLit', true);
    expect(sendEvent).toHaveBeenNthCalledWith(2, 'pipeLit', false);
    expect(sendEvent).toHaveBeenNthCalledWith(3, 'pipeLit', false);
  });

  test('ignores unrelated lines', () => {
    feed('Zapalasz lampe.');
    feed('Stara fajka lezy na ziemi.');
    expect(sendEvent).not.toHaveBeenCalled();
  });

  test('marks the pipe filled when it is loaded', () => {
    characterStorage.setCharacter('PipeTester0');
    characterStorage.set('pipe_filled', false);
    feed('Nabijasz stara podniszczona fajke zeschnietym zoltawym zielem.');
    expect(characterStorage.get('pipe_filled')).toBe(true);
  });

  test('marks the pipe filled when it is already loaded', () => {
    characterStorage.setCharacter('PipeTester6');
    characterStorage.set('pipe_filled', false);
    feed('Stara podniszczona fajke musisz pierw wypalic, badz oproznic, nim bedziesz mogl nabic ja nowym zielem.');
    expect(characterStorage.get('pipe_filled')).toBe(true);
  });

  test('tracks the filled state for custom pipes with adjectives after the noun', () => {
    characterStorage.setCharacter('PipeTester7');
    characterStorage.set('pipe_filled', false);
    feed('Nabijasz kosciana fajke zwienczona osmolonymi piorami odrobina wysuszonego wonnego ziela.');
    expect(characterStorage.get('pipe_filled')).toBe(true);

    characterStorage.set('pipe_filled', false);
    feed('Kosciana fajke zwienczona osmolonymi piorami musisz pierw wypalic, badz oproznic, nim bedziesz mogl nabic ja nowym zielem.');
    expect(characterStorage.get('pipe_filled')).toBe(true);
  });

  test('clears the persisted filled state when the pipe burns out', () => {
    characterStorage.setCharacter('PipeTester');
    characterStorage.set('pipe_filled', true);
    feed('Stara podniszczona fajka wypala sie i gasnie.');
    expect(characterStorage.get('pipe_filled')).toBe(false);
  });

  test("ignores another player's pipe burning out (introduced name)", () => {
    characterStorage.setCharacter('PipeTester8');
    characterStorage.set('pipe_filled', true);
    feed('Stara wygieta fajka Pabla wypala sie i gasnie.');
    expect(sendEvent).not.toHaveBeenCalled();
    expect(characterStorage.get('pipe_filled')).toBe(true);
  });

  test("ignores another player's pipe burning out (unintroduced race)", () => {
    characterStorage.setCharacter('PipeTester9');
    characterStorage.set('pipe_filled', true);
    feed('Stara wygieta fajka jakiegos tam krasnoluda wypala sie i gasnie.');
    expect(sendEvent).not.toHaveBeenCalled();
    expect(characterStorage.get('pipe_filled')).toBe(true);
  });

  test('clears the filled state when there is not enough herb to light', () => {
    characterStorage.setCharacter('PipeTester2');
    characterStorage.set('pipe_filled', true);
    feed('W starej podniszczonej fajce nie ma dostatecznie duzo ziela.');
    expect(characterStorage.get('pipe_filled')).toBe(false);
  });

  test('clears the filled state when the pipe is emptied', () => {
    characterStorage.setCharacter('PipeTester3');
    characterStorage.set('pipe_filled', true);
    feed('Dokladnie ostukujac i czyszczac stara podniszczona fajke oprozniasz ja z resztek znajdujacego sie w srodku ziela.');
    expect(characterStorage.get('pipe_filled')).toBe(false);
  });

  test('ignores "Nie da sie jej zapalic" when no /zapal is pending', () => {
    feed('Nie da sie jej zapalic.');
    expect(sendEvent).not.toHaveBeenCalled();
  });

  test('treats "Nie da sie jej zapalic" after /zapal as the pipe already being lit', async () => {
    characterStorage.setCharacter('PipeTester5');
    characterStorage.set('pipe_filled', true); // so /zapal skips filling (no herb data needed)

    const localTriggers = new Triggers({} as any);
    const localSendEvent = jest.fn();
    const sendCommand = jest.fn();
    const aliases: { pattern: RegExp; callback: Function }[] = [];
    initPipe(
      { Triggers: localTriggers, sendEvent: localSendEvent, sendCommand, println: jest.fn() } as any,
      aliases,
    );

    const zapal = aliases.find((a) => a.pattern.test('/zapal'))!;
    await zapal.callback();
    expect(sendCommand).toHaveBeenCalledWith('zapal fajke');

    localSendEvent.mockClear();
    localTriggers.parseLine(new AnsiAwareBuffer('Nie da sie jej zapalic.'), '');
    expect(localSendEvent).toHaveBeenCalledWith('pipeLit', true);
  });
});
