import NotificationManager from '@client/NotificationManager';

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
