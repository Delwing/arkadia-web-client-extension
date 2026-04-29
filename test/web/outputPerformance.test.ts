import arkadiaClient from '@web/MudClient';
import {setupOutputMessageHandler} from '@shared/dom/outputMessageHandler';

describe('output performance measurements', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="main_text_output_msg_wrapper">
        <div id="split-bottom" class="split-hidden">
          <div id="sticky-area"></div>
        </div>
      </div>
    `;
  });

  test('logs timing for handling websocket output', () => {
    const outputWrapper = document.getElementById('main_text_output_msg_wrapper') as HTMLElement;
    const splitBottom = document.getElementById('split-bottom') as HTMLElement;
    const stickyArea = document.getElementById('sticky-area') as HTMLElement;

    const cleanup = setupOutputMessageHandler(arkadiaClient, {
      outputWrapper,
      splitBottom,
      stickyArea,
      isSplitView: () => false,
      stickyLines: 15,
    });

    const clearMessages = () => {
      let first = outputWrapper.firstElementChild;
      while (first && first !== splitBottom) {
        const next = first.nextElementSibling;
        outputWrapper.removeChild(first);
        first = next;
      }
    };

    const measure = (count: number) => {
      const start = performance.now();
      for (let i = 0; i < count; i++) {
        (arkadiaClient as any).processIncomingData(`Line ${i}`);
      }
      const end = performance.now();
      return end - start;
    };

    try {
      const singleLineDuration = measure(1);
      console.log(`[performance] Time to handle 1 line: ${singleLineDuration.toFixed(3)} ms`);

      clearMessages();

      const burstDuration = measure(1000);
      console.log(`[performance] Time to handle 1000 lines: ${burstDuration.toFixed(3)} ms`);
    } finally {
      cleanup();
    }
  });
});
