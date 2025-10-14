import PackageStatus from '../src/PackageStatus';
import appEventBus from '@client/src/events/app-event-bus';

describe('PackageStatus', () => {
  let container: HTMLElement;

  beforeEach(() => {
    appEventBus.clear();
    document.body.innerHTML = '<div id="package-status"></div>';
    container = document.getElementById('package-status')!;
    new PackageStatus({} as any);
  });

  test('hides when no data', () => {
    appEventBus.emit('packageStatus', null);
    expect(container.style.display).toBe('none');
    expect(container.textContent).toBe('');
  });

  test('shows recipient and time', () => {
    appEventBus.emit('packageStatus', { recipient: 'Bob', seconds: 70 });
    expect(container.textContent).toBe('📦: Bob 1:10');
    expect(container.style.display).toBe('block');

    appEventBus.emit('packageStatus', { recipient: 'Alice' });
    expect(container.textContent).toBe('📦: Alice');
  });
});
