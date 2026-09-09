import { vi } from 'vitest';
import { resetPushCooldown, sendPush } from '@modules/push/pushClient';
import { loadPushCredentials } from '@modules/push/pushCredentials';

vi.mock('@modules/push/pushCredentials', () => ({
  loadPushCredentials: vi.fn(),
  pushAuthHeader: vi.fn(() => 'Bearer id.secret'),
  savePushCredentials: vi.fn(),
  clearPushCredentials: vi.fn(),
}));

const mockedLoad = vi.mocked(loadPushCredentials);

function okResponse(delivered = 1) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, delivered }),
  } as unknown as Response;
}

beforeEach(() => {
  resetPushCooldown();
  mockedLoad.mockReturnValue({ pushId: 'id', pushSecret: 'secret' });
  vi.stubGlobal('fetch', vi.fn(async () => okResponse()));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sendPush', () => {
  test('posts the alert and reports how many devices got it', async () => {
    const result = await sendPush({ title: 'Arkadia', body: 'Jestes ciezko ranny' });

    expect(result).toEqual({ ok: true, delivered: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toMatch(/\/push\/notify$/);
    expect((init as RequestInit).method).toBe('POST');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer id.secret');
  });

  test('does nothing without a push account', async () => {
    mockedLoad.mockReturnValue(null);
    const result = await sendPush({ title: 'a', body: 'b' });

    expect(result).toMatchObject({ ok: false, error: 'no_account' });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('rate limits a burst to one push', async () => {
    // hpAlert fires on every hp drop; without this one fight becomes a phone
    // that buzzes for a solid minute.
    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(await sendPush({ title: 'Arkadia', body: 'hit ' + i }));
    }

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(results[1]).toMatchObject({ ok: false, error: 'cooldown' });
  });

  test('the limit is shared, not per caller', async () => {
    // A `push` trigger macro and the hp alert reach the same phone, so the
    // cooldown has to be common to both rather than held by either.
    const nowSpy = vi.spyOn(Date, 'now');

    nowSpy.mockReturnValue(1_000_000);
    expect((await sendPush({ title: 'a', body: 'hp alert' })).ok).toBe(true);

    nowSpy.mockReturnValue(1_000_000 + 30_000);
    expect((await sendPush({ title: 'a', body: 'trigger macro' })).ok).toBe(false);

    nowSpy.mockReturnValue(1_000_000 + 61_000);
    expect((await sendPush({ title: 'a', body: 'later' })).ok).toBe(true);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('survives the worker being unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));

    // Must resolve, not reject: push is an accessory and a dead Worker cannot
    // be allowed to surface mid-fight.
    const result = await sendPush({ title: 'a', body: 'b' });
    expect(result.ok).toBe(false);
  });
});
