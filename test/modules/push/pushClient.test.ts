import { vi } from 'vitest';
import {
  claimPairingFromLocation,
  enablePush,
  isPushEnabled,
  resetPushCooldown,
  sendPush,
} from '@modules/push/pushClient';
import { loadPushCredentials } from '@modules/push/pushCredentials';
import { getBehaviorSettings } from '@modules/core/settings';

vi.mock('@modules/core/settings', () => ({
  getBehaviorSettings: vi.fn(() => ({ pushOnlyWhenHidden: false })),
}));

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
  vi.mocked(getBehaviorSettings).mockReturnValue(
    { pushOnlyWhenHidden: false } as ReturnType<typeof getBehaviorSettings>,
  );
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

  test('bypassCooldown sends inside the window', async () => {
    await sendPush({ title: 'a', body: 'first' });
    expect((await sendPush({ title: 'a', body: 'blocked' })).ok).toBe(false);

    const urgent = await sendPush({ title: 'a', body: 'urgent' }, { bypassCooldown: true });
    expect(urgent.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('a bypassing send does not consume the ordinary budget', async () => {
    // It is exempt from the limit, so it must not push the next automatic
    // alert out by a further minute.
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000_000);

    await sendPush({ title: 'a', body: 'urgent' }, { bypassCooldown: true });
    // Immediately afterwards a normal send is still allowed, because the
    // bypassing one never stamped the clock.
    expect((await sendPush({ title: 'a', body: 'normal' })).ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('pushOnlyWhenHidden holds the send back while the tab is focused', async () => {
    vi.mocked(getBehaviorSettings).mockReturnValue(
      { pushOnlyWhenHidden: true } as ReturnType<typeof getBehaviorSettings>,
    );
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });

    expect(await sendPush({ title: 'a', body: 'b' })).toMatchObject({ error: 'tab_visible' });
    expect(fetch).not.toHaveBeenCalled();

    // The test button has to work while the player is looking at the settings
    // screen, which is precisely when the gate would block it.
    expect((await sendPush({ title: 'a', body: 'b' }, { ignoreVisibilityGate: true })).ok).toBe(true);

    // And it must not have consumed the cooldown on the way to being blocked.
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
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

  test('isPushEnabled resolves when no service worker is registered', async () => {
    // Regression: this used to await navigator.serviceWorker.ready, which never
    // resolves when nothing is registered — it does not reject, it simply hangs.
    // Every caller awaiting it on a fresh browser waited for good, which is how
    // the "enable" button appeared to do nothing at all.
    vi.stubGlobal('Notification', class {});
    vi.stubGlobal('PushManager', class {});
    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: { getRegistration: async () => undefined },
      configurable: true,
    });

    const settled = await Promise.race([
      isPushEnabled().then(() => 'resolved'),
      new Promise(resolve => setTimeout(() => resolve('hung'), 1000)),
    ]);
    expect(settled).toBe('resolved');
  });

  test('reports an expired code and still strips the fragment', async () => {
    // The fragment must go even on failure: the code is single use, so a reload
    // retrying a burned one would report a confusing second failure.
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ status: 'not_found', message: 'gone' }),
    } as unknown as Response)));
    window.location.hash = '#push-pair=DEADBEEF';

    const outcome = await claimPairingFromLocation();

    expect(outcome).toEqual({ status: 'expired' });
    expect(window.location.hash).toBe('');
  });

  test('does nothing on a normal load', async () => {
    window.location.hash = '';
    expect(await claimPairingFromLocation()).toEqual({ status: 'none' });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('treats a blocked site as terminal without re-prompting', async () => {
    // requestPermission() resolves as denied without showing anything once a
    // site is blocked, so calling it would be pointless — and reporting "try
    // again" would be a lie, since only browser settings can undo it.
    const requestPermission = vi.fn();
    vi.stubGlobal('Notification', Object.assign(class {}, {
      permission: 'denied',
      requestPermission,
    }));
    vi.stubGlobal('PushManager', class {});
    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: { getRegistration: async () => undefined, register: vi.fn() },
      configurable: true,
    });

    expect(await enablePush()).toEqual({ ok: false, error: 'denied' });
    expect(requestPermission).not.toHaveBeenCalled();
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
