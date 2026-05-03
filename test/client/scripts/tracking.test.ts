import initTracking from '@client/scripts/tracking';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  print = jest.fn();
}

// Mock DOM container for testing
function createMockContainer(): HTMLElement {
  const container = document.createElement('span');
  container.className = 'output_msg_content';
  return container;
}

describe('tracking triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;
  let lastContainer: HTMLElement | null;

  beforeEach(() => {
    client = new FakeClient();
    initTracking((client as unknown) as any);
    lastContainer = null;

    // Parse function that also simulates render
    parse = (line: string) => {
      const buffer = new AnsiAwareBuffer(line);
      const result = Triggers.prototype.parseLine.call(client.Triggers, buffer, '');

      // Simulate DOM render - call notifyRender with a mock container
      if (result) {
        const container = createMockContainer();
        container.appendChild(result.toDom());
        result.notifyRender(container);
        lastContainer = container;
      }

      return result;
    };
  });

  test('highlights direction only with green for sure tracking with trace', () => {
    const result = parse('Jestes w stanie wyroznic kilka sladow na ziemi. Najswiezsze zostaly pozostawione przez jakiegos orka i prowadza na wschod.');
    expect(result?.text).toBe('Jestes w stanie wyroznic kilka sladow na ziemi. Najswiezsze zostaly pozostawione przez jakiegos orka i prowadza na wschod.');
    const segments = result?.getSegments();
    // Only the direction "wschod" should be colored
    const coloredSegments = segments?.filter(seg => seg.state?.foreground);
    expect(coloredSegments?.length).toBe(1);
    expect(coloredSegments?.[0].text).toBe('wschod');
    const printed = client.print.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : c[0]?.text);
    expect(printed).toEqual([
      '\n',
      '                  #',
      '                   #',
      '              #######',
      '                   #',
      '                  #',
      '\n'
    ]);
  });

  test('highlights direction only with green for sure tracking with trace (prawdopodobnie)', () => {
    const result = parse('Jestes w stanie wyroznic kilka sladow na ziemi. Najswiezsze zostaly pozostawione prawdopodobnie przez jakiegos orka i prowadza na polnoc.');
    expect(result?.text).toBe('Jestes w stanie wyroznic kilka sladow na ziemi. Najswiezsze zostaly pozostawione prawdopodobnie przez jakiegos orka i prowadza na polnoc.');
    const segments = result?.getSegments();
    const coloredSegments = segments?.filter(seg => seg.state?.foreground);
    expect(coloredSegments?.length).toBe(1);
    expect(coloredSegments?.[0].text).toBe('polnoc');
    const printed = client.print.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : c[0]?.text);
    expect(printed).toEqual([
      '\n',
      '                  #',
      '                 ###',
      '                # # #',
      '                  #',
      '                  #',
      '\n'
    ]);
  });

  test('highlights direction only with yellow for unsure tracking', () => {
    const result = parse('Jestes w stanie wyroznic kilka sladow na ziemi. Najswiezsze prowadza prawdopodobnie na zachod.');
    expect(result?.text).toBe('Jestes w stanie wyroznic kilka sladow na ziemi. Najswiezsze prowadza prawdopodobnie na zachod.');
    const segments = result?.getSegments();
    const coloredSegments = segments?.filter(seg => seg.state?.foreground);
    expect(coloredSegments?.length).toBe(1);
    expect(coloredSegments?.[0].text).toBe('zachod');
    const printed = client.print.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : c[0]?.text);
    expect(printed).toEqual([
      '\n',
      '                #',
      '               #',
      '              #######',
      '               #',
      '                #',
      '\n'
    ]);
  });

  test('highlights direction only with royal blue for sure tracking', () => {
    const result = parse('Jestes w stanie wyroznic kilka sladow na ziemi. Najswiezsze prowadza na poludnie.');
    expect(result?.text).toBe('Jestes w stanie wyroznic kilka sladow na ziemi. Najswiezsze prowadza na poludnie.');
    const segments = result?.getSegments();
    const coloredSegments = segments?.filter(seg => seg.state?.foreground);
    expect(coloredSegments?.length).toBe(1);
    expect(coloredSegments?.[0].text).toBe('poludnie');
    const printed = client.print.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : c[0]?.text);
    expect(printed).toEqual([
      '\n',
      '                  #',
      '                  #',
      '                # # #',
      '                 ###',
      '                  #',
      '\n'
    ]);
  });

  test('handles diagonal directions', () => {
    const result = parse('Jestes w stanie wyroznic kilka sladow na ziemi. Najswiezsze prowadza na polnocny-wschod.');
    expect(result?.text).toBe('Jestes w stanie wyroznic kilka sladow na ziemi. Najswiezsze prowadza na polnocny-wschod.');
    const segments = result?.getSegments();
    const coloredSegments = segments?.filter(seg => seg.state?.foreground);
    expect(coloredSegments?.length).toBe(1);
    expect(coloredSegments?.[0].text).toBe('polnocny-wschod');
    const printed = client.print.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : c[0]?.text);
    expect(printed).toEqual([
      '\n',
      '                   # # #',
      '                     # #',
      '                   #   #',
      '                 #',
      '               #',
      '\n'
    ]);
  });

  test('handles "Jest ona" alternate form with unsure (yellow)', () => {
    const result = parse('Jest ona bardzo wyrazna. Najswiezsze prowadza prawdopodobnie na zachod.');
    expect(result?.text).toBe('Jest ona bardzo wyrazna. Najswiezsze prowadza prawdopodobnie na zachod.');
    const segments = result?.getSegments();
    const coloredSegments = segments?.filter(seg => seg.state?.foreground);
    expect(coloredSegments?.length).toBe(1);
    expect(coloredSegments?.[0].text).toBe('zachod');
    const printed = client.print.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : c[0]?.text);
    expect(printed).toEqual([
      '\n',
      '                #',
      '               #',
      '              #######',
      '               #',
      '                #',
      '\n'
    ]);
  });

  test('handles "Jest on" alternate form with sure (royal blue)', () => {
    const result = parse('Jest on bardzo wyrazny. Najswiezsze prowadza na wschod.');
    expect(result?.text).toBe('Jest on bardzo wyrazny. Najswiezsze prowadza na wschod.');
    const segments = result?.getSegments();
    const coloredSegments = segments?.filter(seg => seg.state?.foreground);
    expect(coloredSegments?.length).toBe(1);
    expect(coloredSegments?.[0].text).toBe('wschod');
    const printed = client.print.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : c[0]?.text);
    expect(printed).toEqual([
      '\n',
      '                  #',
      '                   #',
      '              #######',
      '                   #',
      '                  #',
      '\n'
    ]);
  });

  test('handles "Jest ona" with race info (green)', () => {
    const result = parse('Jest ona bardzo wyrazna. Najswiezsze zostaly pozostawione przez jakiegos orka i prowadza na polnoc.');
    expect(result?.text).toBe('Jest ona bardzo wyrazna. Najswiezsze zostaly pozostawione przez jakiegos orka i prowadza na polnoc.');
    const segments = result?.getSegments();
    const coloredSegments = segments?.filter(seg => seg.state?.foreground);
    expect(coloredSegments?.length).toBe(1);
    expect(coloredSegments?.[0].text).toBe('polnoc');
    const printed = client.print.mock.calls.map(c => typeof c[0] === 'string' ? c[0] : c[0]?.text);
    expect(printed).toEqual([
      '\n',
      '                  #',
      '                 ###',
      '                # # #',
      '                  #',
      '                  #',
      '\n'
    ]);
  });

  describe('kneeling tracker', () => {
    let wstajeContainer: HTMLElement | null;

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    // Helper to parse and capture the wstaje container
    const parseAndCaptureWstaje = (line: string) => {
      const result = parse(line);
      if (line.includes('wstaje')) {
        wstajeContainer = lastContainer;
      }
      return result;
    };

    test('adds red prefix to wstaje line when kneel + stand up without tracking result (after 1 line)', () => {
      parse('Gandalf kleka, by obejrzec dokladnie grunt.');
      parseAndCaptureWstaje('Gandalf wstaje.');
      parse('Jakis inny tekst.');

      // The wstaje container should now have prefix (after 1 non-tracking line)
      expect(wstajeContainer?.textContent).toContain('[Brak sladow]');
      // Check that it's colored red
      const prefixSpan = wstajeContainer?.querySelector('span[style*="color"]');
      expect(prefixSpan).toBeTruthy();
    });

    test('adds prefix via timeout if no line arrives within 100ms', () => {
      parse('Gandalf kleka, by obejrzec dokladnie grunt.');
      parseAndCaptureWstaje('Gandalf wstaje.');

      // Before timeout, no prefix
      expect(wstajeContainer?.textContent).not.toContain('[Brak sladow]');

      // Fast-forward past the 100ms timeout
      jest.advanceTimersByTime(150);

      // Now the prefix should be added
      expect(wstajeContainer?.textContent).toContain('[Brak sladow]');
    });

    test('does not add prefix when tracking result follows stand up', () => {
      parse('Gandalf kleka, by obejrzec dokladnie grunt.');
      parseAndCaptureWstaje('Gandalf wstaje.');
      parse('Jestes w stanie wyroznic kilka sladow na ziemi. Najswiezsze prowadza na wschod.');

      // The wstaje container should NOT have prefix
      expect(wstajeContainer?.textContent).not.toContain('[Brak sladow]');
    });

    test('handles multi-word names', () => {
      parse('Jakis stary ork kleka, by obejrzec dokladnie grunt.');
      parseAndCaptureWstaje('Jakis stary ork wstaje.');
      parse('Jakis inny tekst.');

      expect(wstajeContainer?.textContent).toContain('[Brak sladow]');
    });

    test('clears tracker after 10s timeout without stand up', () => {
      parse('Gandalf kleka, by obejrzec dokladnie grunt.');

      // Fast-forward past the 10s timeout
      jest.advanceTimersByTime(11000);

      // Now stand up - should not trigger prefix since tracker expired
      parseAndCaptureWstaje('Gandalf wstaje.');
      parse('Jakis inny tekst.');

      expect(wstajeContainer?.textContent).not.toContain('[Brak sladow]');
    });

    test('does not trigger for untracked stand up', () => {
      // Stand up without kneeling first
      parseAndCaptureWstaje('Gandalf wstaje.');
      parse('Jakis inny tekst.');

      expect(wstajeContainer?.textContent).not.toContain('[Brak sladow]');
    });
  });
});
