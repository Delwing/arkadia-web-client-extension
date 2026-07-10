import { describe, expect, test } from 'vitest';
import { measureContentColumns } from '@web/contentWidthMeasurer';

describe('measureContentColumns', () => {
  test('divides usable width by character width', () => {
    document.body.innerHTML =
      '<div id="main_text_output_msg_wrapper"></div>' +
      '<span id="content-width-measure">M</span>';
    const content = document.getElementById('main_text_output_msg_wrapper')! as HTMLElement;
    Object.defineProperty(content, 'clientWidth', { value: 100, configurable: true });
    const measure = document.getElementById('content-width-measure')! as HTMLElement;
    (measure as any).getBoundingClientRect = () => ({ width: 10 });

    expect(measureContentColumns(content, measure)).toBe(10);
  });

  test('subtracts horizontal padding before dividing', () => {
    document.body.innerHTML =
      '<div id="main_text_output_msg_wrapper" style="padding-left:5px;padding-right:5px"></div>' +
      '<span id="content-width-measure">M</span>';
    const content = document.getElementById('main_text_output_msg_wrapper')! as HTMLElement;
    Object.defineProperty(content, 'clientWidth', { value: 100, configurable: true });
    const measure = document.getElementById('content-width-measure')! as HTMLElement;
    (measure as any).getBoundingClientRect = () => ({ width: 10 });

    // (100 - 5 - 5) / 10 = 9
    expect(measureContentColumns(content, measure)).toBe(9);
  });

  test('returns null when it cannot be measured yet', () => {
    document.body.innerHTML =
      '<div id="main_text_output_msg_wrapper"></div>' +
      '<span id="content-width-measure">M</span>';
    const content = document.getElementById('main_text_output_msg_wrapper')! as HTMLElement;
    Object.defineProperty(content, 'clientWidth', { value: 0, configurable: true });
    const measure = document.getElementById('content-width-measure')! as HTMLElement;
    (measure as any).getBoundingClientRect = () => ({ width: 0 });

    expect(measureContentColumns(content, measure)).toBeNull();
  });
});
