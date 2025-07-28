import PackageStatus from './PackageStatus';

class MockClient {
  private events: Record<string, Function[]> = {};
  on(event: string, listener: Function) {
    (this.events[event] ||= []).push(listener);
  }
  emit(event: string, ...args: any[]) {
    (this.events[event] || []).forEach(fn => fn(...args));
  }
}

describe('PackageStatus', () => {
  let container: HTMLElement;
  let client: MockClient;

  beforeEach(() => {
    document.body.innerHTML = '<div id="package-status"></div>';
    container = document.getElementById('package-status')!;
    client = new MockClient();
    new PackageStatus(client as any);
  });

  test('hides when no data', () => {
    client.emit('packageStatus', null);
    expect(container.style.display).toBe('none');
    expect(container.textContent).toBe('');
  });

  test('shows recipient and time', () => {
    client.emit('packageStatus', { recipient: 'Bob', seconds: 70 });
    expect(container.textContent).toBe('📦: Bob 1:10');
    expect(container.style.display).toBe('block');

    client.emit('packageStatus', { recipient: 'Alice' });
    expect(container.textContent).toBe('📦: Alice');
  });
});
