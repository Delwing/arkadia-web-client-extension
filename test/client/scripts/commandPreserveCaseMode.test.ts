import type { CommandOptions } from '@client/scripts/commandPreserveCaseMode';

describe('commandPreserveCaseMode', () => {
  class FakeClient {
    eventTarget = new EventTarget();
    Triggers = {
      registerTrigger: jest.fn(),
    } as any;

    on(event: string, listener: (arg: any) => void) {
      const wrapped = (ev: Event) => listener((ev as CustomEvent).detail);
      this.eventTarget.addEventListener(event, wrapped as EventListener);
      return () => this.eventTarget.removeEventListener(event, wrapped as EventListener);
    }

    emit(event: string, detail: any) {
      this.eventTarget.dispatchEvent(new CustomEvent(event, { detail }));
    }
  }

  let normalizeCommand: (command: string, options?: CommandOptions) => string;
  let initCommandPreserveCaseMode: (client: any) => void;
  let client: FakeClient;

  beforeEach(async () => {
    jest.resetModules();
    const module = await import('@client/scripts/commandPreserveCaseMode');
    normalizeCommand = module.normalizeCommand;
    initCommandPreserveCaseMode = module.default;
    client = new FakeClient();
    initCommandPreserveCaseMode((client as unknown) as any);
  });

  test('lowercases regular commands by default while preserving leading whitespace', () => {
    expect(normalizeCommand('HeLLo there')).toBe('hello there');
    expect(normalizeCommand('  HeLLo')).toBe('  hello');
  });

  test('respects preserveCase option and skip prefixes', () => {
    expect(normalizeCommand('HeLLo', { preserveCase: true })).toBe('HeLLo');
    expect(normalizeCommand('powiedz Hej')).toBe('powiedz Hej');
  });

  test('enters and exits preserve case mode based on commands and triggers', () => {
    const registerTriggerMock = client.Triggers.registerTrigger as jest.Mock;
    expect(registerTriggerMock).toHaveBeenCalledTimes(6);
    registerTriggerMock.mock.calls.forEach((call: any[]) => {
      expect(call[2]).toBe('command-preserve-case-mode');
    });

    client.emit('command', 'napisz list');
    expect(normalizeCommand('ShOuT')).toBe('ShOuT');

    const [, exitCallback] = registerTriggerMock.mock.calls[0];
    expect(typeof exitCallback).toBe('function');
    exitCallback();

    expect(normalizeCommand('ShOuT')).toBe('shout');
  });

  test('toggles preserve case mode with gmcp editing events', () => {
    client.emit('gmcp.char.info', { object_num: 42 });
    client.emit('gmcp.objects.data', { 42: { editing: true } });
    expect(normalizeCommand('Look Around')).toBe('Look Around');

    client.emit('gmcp.objects.data', { 42: { editing: false } });
    expect(normalizeCommand('Look Around')).toBe('look around');
  });
});
