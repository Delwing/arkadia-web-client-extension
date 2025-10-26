import TriggerLine from '../../src/triggers/TriggerLine';

describe('TriggerLine formatting helpers', () => {
  it('infers formatting when replacing text inside coloured segments', () => {
    const raw = '\u001b[31mHello\u001b[0m friend';
    const line = new TriggerLine(raw);

    line.replace([0, 5], 'Hi');

    expect(line.text).toBe('Hi friend');
    expect(line.toAnsiString()).toBe('\u001b[22;38;5;1mHi\u001b[0m friend');
  });

  it('carries formatting forward when inserting at segment boundaries', () => {
    const raw = '\u001b[32mGreen\u001b[0m!';
    const line = new TriggerLine(raw);

    line.insert(5, 'ish');

    expect(line.text).toBe('Greenish!');
    expect(line.toAnsiString()).toBe('\u001b[22;38;5;2mGreenish\u001b[0m!');
  });

  it('retains hyperlink metadata during insertions', () => {
    const raw = '{clickOpen:7:profile}Eamon{clickClose} walks in';
    const line = new TriggerLine(raw);

    line.insert(5, ' the Brave');

    expect(line.text).toBe('Eamon the Brave walks in');
    expect(line.toAnsiString()).toBe('{clickOpen:7:profile}Eamon the Brave{clickClose} walks in');
    expect(line.toHyperlinkSegments()).toEqual([
      { text: 'Eamon the Brave', hyperlink: { id: 7, title: 'profile' } },
      { text: ' walks in', hyperlink: undefined },
    ]);
  });
});
