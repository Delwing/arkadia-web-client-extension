// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAutoScroll } from '@web/hooks/useAutoScroll';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let split = false;

function Scrollback({ withPane }: { withPane: boolean }) {
  const { containerRef, isSplitView, splitPaneRef } = useAutoScroll(withPane ? { splitHeight: 120 } : {});
  split = isSplitView;
  return (
    <div id="list" ref={containerRef}>
      <div>line</div>
      {isSplitView && <div className="popup-split-bottom" ref={splitPaneRef} style={{ height: 120 }} />}
    </div>
  );
}

// jsdom has no layout: the list's scroll geometry is set by hand
function scrollTo(list: HTMLElement, top: number) {
  for (const [key, value] of Object.entries({ scrollTop: top, scrollHeight: 1000, clientHeight: 100, clientWidth: 200 })) {
    Object.defineProperty(list, key, { configurable: true, writable: true, value });
  }
  act(() => { list.dispatchEvent(new Event('scroll')); });
}

const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

describe('useAutoScroll split view', () => {
  let container: HTMLDivElement;
  let root: Root;
  const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');

  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) { return this.classList.contains('popup-split-bottom') ? 120 : 0; },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    if (offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight);
  });

  it('lays a pane over the last lines and closes it only at the real bottom', async () => {
    act(() => root.render(<Scrollback withPane />));
    const list = container.querySelector('#list') as HTMLElement;
    // The first size it sees is taken as a resize, not a scroll
    scrollTo(list, 900);
    await wait(300);

    // On its own layer like the pane, so text is drawn the same in both
    expect(list.style.willChange).toBe('transform');

    scrollTo(list, 0);
    expect(split).toBe(true);
    // No height added below the content: showing and hiding never change the scroll height
    expect((container.querySelector('.popup-split-bottom') as HTMLElement).style.marginTop).toBe('-120px');

    await wait(200);
    // Within the pane's height of the bottom is not the bottom
    scrollTo(list, 800);
    expect(split).toBe(true);

    scrollTo(list, 900);
    expect(split).toBe(false);
  });

  it('keeps the friendlier tolerance where no pane is drawn', async () => {
    act(() => root.render(<Scrollback withPane={false} />));
    const list = container.querySelector('#list') as HTMLElement;
    // The first size it sees is taken as a resize, not a scroll
    scrollTo(list, 900);
    await wait(300);

    // 40px short of the bottom still counts as the bottom
    scrollTo(list, 860);
    expect(split).toBe(false);
    expect(list.style.willChange).toBe('');
  });
});
