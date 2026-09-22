import { getColorLevel, COLOR_TEXT, COLOR_OBJECT } from '@web/colors';

describe('getColorLevel', () => {
  test('computes color level based on ratio', () => {
    expect(getColorLevel(0, 0)).toBe('danger');
    expect(getColorLevel(1, 3)).toBe('danger');
    expect(getColorLevel(2, 3)).toBe('warning');
    expect(getColorLevel(3, 3)).toBe('success');
  });

  test('supports reverse mode', () => {
    expect(getColorLevel(2, 3, true)).toBe('danger');
    expect(getColorLevel(1, 3, true)).toBe('warning');
    expect(getColorLevel(0, 3, true)).toBe('success');
  });

  test('supports HP thresholds', () => {
    expect(getColorLevel(2, 10, false, true)).toBe('danger');
    expect(getColorLevel(5, 10, false, true)).toBe('warning');
    expect(getColorLevel(6, 10, false, true)).toBe('success');
  });
});

describe('color constants', () => {
  test('text colors', () => {
    expect(COLOR_TEXT.success).toBe('green');
    expect(COLOR_TEXT.warning).toBe('yellow');
    expect(COLOR_TEXT.danger).toBe('red');
  });

  test('object colors', () => {
    expect(COLOR_OBJECT.success).toBe('springgreen');
    expect(COLOR_OBJECT.warning).toBe('yellow');
    expect(COLOR_OBJECT.danger).toBe('tomato');
  });
});

