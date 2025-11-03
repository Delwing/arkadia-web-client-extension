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

  it('applies indexed colour to a range', () => {
    const raw = 'Color me';
    const line = new TriggerLine(raw);

    const result = line.color([6, 8], 5);

    expect(result).toBe(line);
    expect(line.text).toBe('Color me');
    expect(line.toAnsiString()).toBe('Color \u001b[22;38;5;5mme\u001b[0m');
  });

  it('colours matching words case-insensitively', () => {
    const raw = 'Enemy ally ENEMY';
    const line = new TriggerLine(raw);

    line.colorWords(['enemy', 'ally'], 4, { caseInsensitive: true });

    expect(line.toAnsiString()).toBe('\u001b[22;38;5;4mEnemy\u001b[0m \u001b[22;38;5;4mally\u001b[0m \u001b[22;38;5;4mENEMY\u001b[0m');
  });
});
