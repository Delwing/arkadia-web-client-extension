import OutputHandler from '../src/OutputHandler';
import { showContextMenu, hideContextMenu } from '@shared/dom/contextMenu';

class FakeClient {
  eventTarget = new EventTarget();
  private listenerMap = new Map<Function, EventListener>();
  on(event: string, cb: any, options?: any) {
    const wrapped: EventListener = (ev: Event) => cb((ev as CustomEvent).detail);
    this.listenerMap.set(cb, wrapped);
    this.eventTarget.addEventListener(event, wrapped, options);
    return () => this.off(event, cb);
  }
  off(event: string, cb: any) {
    const wrapped = this.listenerMap.get(cb);
    if (wrapped) {
      this.eventTarget.removeEventListener(event, wrapped);
      this.listenerMap.delete(cb);
    }
  }
  dispatch(type: string, detail?: any) {
    this.eventTarget.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

describe('OutputHandler clickable text', () => {
  test('handles clicks without span elements', () => {
    document.body.innerHTML =
      '<div id="main_text_output_msg_wrapper"><div id="split-bottom"><div id="sticky-area"></div></div></div><div id="context-menu"></div>';
    const client = new FakeClient();
    const handler = new OutputHandler((client as unknown) as any);
    const wrapper = document.getElementById('main_text_output_msg_wrapper')!;
    const div = document.createElement('div');
    div.className = 'output_msg';
    const msg = document.createElement('div');
    msg.className = 'output_msg_text';
    const cb = jest.fn();
    msg.textContent = handler.makeClickable('Click', 'Click', cb);
    div.appendChild(msg);
    const split = document.getElementById('split-bottom')!;
    wrapper.insertBefore(div, split);

    client.dispatch('output-sent', 1);

    const span = msg.querySelector('span') as HTMLSpanElement | null;
    expect(span).not.toBeNull();
    expect(msg.textContent).toBe('Click');
    span!.onclick!(new MouseEvent('click'));
    expect(cb).toHaveBeenCalledTimes(1);
    expect((handler as any).clickerCallbacks[0]).toBeUndefined();
  });

  test('handles right click', () => {
    document.body.innerHTML =
      '<div id="main_text_output_msg_wrapper"><div id="split-bottom"></div></div><div id="context-menu"></div>';
    const client = new FakeClient();
    const handler = new OutputHandler((client as unknown) as any);
    const wrapper = document.getElementById('main_text_output_msg_wrapper')!;
    const div = document.createElement('div');
    div.className = 'output_msg';
    const msg = document.createElement('div');
    msg.className = 'output_msg_text';
    const cb = jest.fn();
    msg.textContent = handler.makeStringRightClickable('Click', cb);
    div.appendChild(msg);
    const split = document.getElementById('split-bottom')!;
    wrapper.insertBefore(div, split);

    client.dispatch('output-sent', 1);

    const span = msg.querySelector('span') as HTMLSpanElement | null;
    expect(span).not.toBeNull();
    const event = new MouseEvent('contextmenu');
    span!.oncontextmenu!(event);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(event);
  });

  test('handles long touch', () => {
    jest.useFakeTimers();
    document.body.innerHTML =
      '<div id="main_text_output_msg_wrapper"><div id="split-bottom"></div></div><div id="context-menu"></div>';
    const client = new FakeClient();
    const handler = new OutputHandler((client as unknown) as any);
    const wrapper = document.getElementById('main_text_output_msg_wrapper')!;
    const div = document.createElement('div');
    div.className = 'output_msg';
    const msg = document.createElement('div');
    msg.className = 'output_msg_text';
    const cb = jest.fn();
    msg.textContent = handler.makeStringRightClickable('Click', cb);
    div.appendChild(msg);
    const split = document.getElementById('split-bottom')!;
    wrapper.insertBefore(div, split);

    client.dispatch('output-sent', 1);

    const span = msg.querySelector('span') as HTMLSpanElement | null;
    expect(span).not.toBeNull();
    const event: any = new Event('touchstart');
    event.touches = [{ clientX: 5, clientY: 6 }];
    span!.dispatchEvent(event);
    jest.advanceTimersByTime(600);
    expect(cb).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  test('handles links in sticky area', () => {
    document.body.innerHTML =
      '<div id="main_text_output_msg_wrapper"><div id="split-bottom"><div id="sticky-area"></div></div></div><div id="context-menu"></div>';
    const client = new FakeClient();
    const handler = new OutputHandler((client as unknown) as any);

    const wrapper = document.getElementById('main_text_output_msg_wrapper')!;
    const sticky = document.getElementById('sticky-area')!;
    const div = document.createElement('div');
    div.className = 'output_msg';
    const msg = document.createElement('div');
    msg.className = 'output_msg_text';
    const cb = jest.fn();
    msg.textContent = handler.makeClickable('Click', 'Click', cb);
    div.appendChild(msg);
    const split = document.getElementById('split-bottom')!;
    wrapper.insertBefore(div, split);

    // simulate split view - clone into sticky area before output-sent event
    sticky.appendChild(div.cloneNode(true));
    const prev = (handler as any).output;
    (handler as any).output = sticky;
    handler['processOutput']!(1);
    (handler as any).output = prev;

    // process original line
    client.dispatch('output-sent', 1);

    const stickyMsg = sticky.querySelector('.output_msg_text') as HTMLElement;
    const span = stickyMsg.querySelector('span') as HTMLSpanElement | null;
    expect(span).not.toBeNull();
    span!.onclick!(new MouseEvent('click'));
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('OutputHandler context menu positioning', () => {
  test('repositions context menu to stay within viewport', () => {
    document.body.innerHTML =
      '<div id="main_text_output_msg_wrapper"><div id="split-bottom"></div></div><div id="context-menu"></div>';
    const client = new FakeClient();
    const handler = new OutputHandler((client as unknown) as any);
    expect(handler).toBeInstanceOf(OutputHandler);
    const menu = document.getElementById('context-menu') as HTMLElement;

    const originalWidthDescriptor = Object.getOwnPropertyDescriptor(
      document.documentElement,
      'clientWidth'
    );
    const originalHeightDescriptor = Object.getOwnPropertyDescriptor(
      document.documentElement,
      'clientHeight'
    );

    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(document.documentElement, 'clientHeight', {
      configurable: true,
      value: 800,
    });

    const rect = {
      width: 250,
      height: 150,
      top: 0,
      left: 0,
      right: 250,
      bottom: 150,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
    const getBoundingClientRectSpy = jest
      .spyOn(menu, 'getBoundingClientRect')
      .mockReturnValue(rect);

    showContextMenu(
      [
        {
          label: 'Action',
          action: jest.fn(),
        },
      ],
      900,
      700
    );

    expect(menu.style.left).toBe('750px');
    expect(menu.style.top).toBe('650px');
    expect(menu.classList.contains('show')).toBe(true);
    expect(menu.style.visibility).toBe('');

    if (originalWidthDescriptor) {
      Object.defineProperty(document.documentElement, 'clientWidth', originalWidthDescriptor);
    } else {
      delete (document.documentElement as any).clientWidth;
    }

    if (originalHeightDescriptor) {
      Object.defineProperty(document.documentElement, 'clientHeight', originalHeightDescriptor);
    } else {
      delete (document.documentElement as any).clientHeight;
    }

    hideContextMenu();
    getBoundingClientRectSpy.mockRestore();
  });
});
