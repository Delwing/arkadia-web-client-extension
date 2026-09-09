import { vi } from 'vitest';
import NotificationManager from '@client/NotificationManager';
import { sendPush } from '@modules/push/pushClient';

vi.mock('@modules/push/pushClient', () => ({
  sendPush: vi.fn().mockResolvedValue({ ok: true, delivered: 1 }),
}));

const mockedSendPush = vi.mocked(sendPush);

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

beforeEach(() => {
  mockedSendPush.mockClear();
  setVisibility('visible');
});

afterEach(() => {
  delete (global as any).Notification;
});

describe('NotificationManager', () => {
  test('requests notification permission when default', () => {
    (global as any).Notification = { permission: 'default', requestPermission: jest.fn() };
    const mgr = new NotificationManager();
    mgr.enableNotifications();
    expect((global as any).Notification.requestPermission).toHaveBeenCalledTimes(1);
  });

  test('does not request permission when already granted', () => {
    (global as any).Notification = { permission: 'granted', requestPermission: jest.fn() };
    const mgr = new NotificationManager();
    mgr.enableNotifications();
    expect((global as any).Notification.requestPermission).not.toHaveBeenCalled();
  });

  test('registers service worker if available', () => {
    (global as any).Notification = { permission: 'granted', requestPermission: jest.fn() };
    const original = (navigator as any).serviceWorker;
    (navigator as any).serviceWorker = { register: jest.fn().mockResolvedValue(undefined) };
    const mgr = new NotificationManager();
    mgr.enableNotifications();
    expect((navigator as any).serviceWorker.register).toHaveBeenCalledWith('sw.js');
    (navigator as any).serviceWorker = original;
  });

  test('notify sends notification when permission granted', () => {
    const mockNotification = jest.fn();
    (global as any).Notification = Object.assign(mockNotification, { permission: 'granted' });
    const mgr = new NotificationManager();
    mgr.notify('test message');
    expect(mockNotification).toHaveBeenCalledWith('test message');
  });

  test('notify does nothing when Notification is undefined', () => {
    delete (global as any).Notification;
    const mgr = new NotificationManager();
    mgr.notify('test');
  });
});

describe('NotificationManager push fan-out', () => {
  test('does not push while the player is looking at the tab', async () => {
    // The whole point of the feature is reaching someone who stepped away. A
    // phone buzzing while the client is on screen is pure noise.
    (global as any).Notification = Object.assign(jest.fn(), { permission: 'granted' });
    setVisibility('visible');

    new NotificationManager().notify('Jestes ciezko ranny');
    await Promise.resolve();

    expect(mockedSendPush).not.toHaveBeenCalled();
  });

  test('pushes to other devices when the tab is hidden', async () => {
    (global as any).Notification = Object.assign(jest.fn(), { permission: 'granted' });
    setVisibility('hidden');

    new NotificationManager().notify('Jestes ciezko ranny');
    await Promise.resolve();

    expect(mockedSendPush).toHaveBeenCalledTimes(1);
    expect(mockedSendPush).toHaveBeenCalledWith({
      title: 'Arkadia',
      body: 'Jestes ciezko ranny',
    });
  });

  test('delegates rate limiting rather than holding its own', async () => {
    // The cooldown lives in sendPush, because a user's `push` trigger macro
    // reaches the same phone without passing through here. This class must
    // therefore not silently swallow repeats of its own.
    (global as any).Notification = Object.assign(jest.fn(), { permission: 'granted' });
    setVisibility('hidden');

    const mgr = new NotificationManager();
    for (let i = 0; i < 10; i++) mgr.notify('hit ' + i);
    await Promise.resolve();

    expect(mockedSendPush).toHaveBeenCalledTimes(10);
  });

  test('still pushes when this browser cannot show a local notification', async () => {
    // The desktop that sends alerts may itself have denied permission; that
    // must not stop the phone being told.
    delete (global as any).Notification;
    setVisibility('hidden');

    new NotificationManager().notify('Jestes ciezko ranny');
    await Promise.resolve();

    expect(mockedSendPush).toHaveBeenCalledTimes(1);
  });
});
