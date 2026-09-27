vi.mock('@client/main', () => ({ __esModule: true }));
vi.mock('@client/sounds', () => ({ __esModule: true, beepSound: 'mock-sound' }));
vi.mock('@modules/core/customSounds', () => ({
  __esModule: true,
  getCustomSound: vi.fn().mockResolvedValue(undefined),
  getCustomSounds: vi.fn().mockResolvedValue([]),
}));

import Client from '@client/Client';
import { setBehaviorSettings } from '@modules/core/settings';

const adapter = () => ({
  send: vi.fn(),
  output: vi.fn(),
  sendGmcp: vi.fn(),
  flushMessageBuffer: vi.fn(),
  emit: vi.fn(),
  shouldEchoCommand: vi.fn(() => false),
});

const flags = (client: Client) => ({
  prefilter: client.Triggers.literalPrefilter,
  verify: client.Triggers.literalPrefilterVerify,
});

describe('Client trigger prefilter setting', () => {
  beforeEach(() => localStorage.clear());

  test('is on by default', () => {
    expect(flags(new Client(adapter() as any))).toEqual({ prefilter: true, verify: false });
  });

  test('follows the stored mode at startup', () => {
    setBehaviorSettings({ triggerPrefilter: 'off' });
    expect(flags(new Client(adapter() as any))).toEqual({ prefilter: false, verify: false });

    setBehaviorSettings({ triggerPrefilter: 'verify' });
    expect(flags(new Client(adapter() as any))).toEqual({ prefilter: false, verify: true });
  });

  test('switches live when the setting changes', () => {
    const client = new Client(adapter() as any);
    setBehaviorSettings({ triggerPrefilter: 'verify' });
    expect(flags(client)).toEqual({ prefilter: false, verify: true });
    setBehaviorSettings({ triggerPrefilter: 'off' });
    expect(flags(client)).toEqual({ prefilter: false, verify: false });
    setBehaviorSettings({ triggerPrefilter: 'on' });
    expect(flags(client)).toEqual({ prefilter: true, verify: false });
  });
});
