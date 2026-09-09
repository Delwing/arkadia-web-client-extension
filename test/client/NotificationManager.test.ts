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

describe('NotificationManager and paired devices', () => {
  test('never forwards a local notification to paired devices', async () => {
    // Push is opt-in per alert, bound in the trigger editor. Fanning every
    // internal notify() out meant a full hp timer or a walk step buzzed a
    // pocket, which is not what anyone paired a device for.
    (global as any).Notification = Object.assign(jest.fn(), { permission: 'granted' });

    const mgr = new NotificationManager();
    mgr.notify('Jestes ciezko ranny');
    mgr.notify('Masz pelne zycie');
    await Promise.resolve();

    expect(mockedSendPush).not.toHaveBeenCalled();
  });

  test('still shows the notification locally', () => {
    const mockNotification = jest.fn();
    (global as any).Notification = Object.assign(mockNotification, { permission: 'granted' });

    new NotificationManager().notify('Jestes ciezko ranny');

    expect(mockNotification).toHaveBeenCalledWith('Jestes ciezko ranny');
  });
});
