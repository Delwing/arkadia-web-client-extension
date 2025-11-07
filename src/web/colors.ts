export type ColorLevel = 'success' | 'warning' | 'danger';

export function getColorLevel(value: number, max: number, reverse = false, isHp = false): ColorLevel {
  if (isHp) {
    if (value <= 3) return 'danger';
    if (value <= 5) return 'warning';
    return 'success';
  }
  const ratio = max === 0 ? 0 : value / max;
  if (reverse) {
    if (ratio >= 2 / 3) return 'danger';
    if (ratio >= 1 / 3) return 'warning';
    return 'success';
  }
  if (ratio <= 1 / 3) return 'danger';
  if (ratio <= 2 / 3) return 'warning';
  return 'success';
}

export const COLOR_BAR_CLASS: Record<ColorLevel, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

export const COLOR_TEXT: Record<ColorLevel, string> = {
  success: 'green',
  warning: 'yellow',
  danger: 'red',
};

export const COLOR_OBJECT: Record<ColorLevel, string> = {
  success: 'springgreen',
  warning: 'yellow',
  danger: 'tomato',
};
