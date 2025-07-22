import OutputHandler from '../src/OutputHandler';

class FakeClient {
  eventTarget = new EventTarget();
  addEventListener(event: string, cb: any, options?: any) {
    this.eventTarget.addEventListener(event, cb, options);
    return () => this.eventTarget.removeEventListener(event, cb, options);
  }
  removeEventListener(event: string, cb: any) {
    this.eventTarget.removeEventListener(event, cb);
  }
  dispatch(type: string, detail?: any) {
    this.eventTarget.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

describe('OutputHandler clickable text', () => {
  test('handles clicks without span elements', () => {
    document.body.innerHTML =
      '<div id="main_text_output_msg_wrapper"><div id="split-bottom"><div id="sticky-area"></div></div></div>';
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

  test('handles links in sticky area', () => {
    document.body.innerHTML =
      '<div id="main_text_output_msg_wrapper"><div id="split-bottom"><div id="sticky-area"></div></div></div>';
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
    handler['processOutput']!(new CustomEvent('output-sent', { detail: 1 }));
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
