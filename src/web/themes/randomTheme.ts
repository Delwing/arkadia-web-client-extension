const STYLE_ID = 'custom-dark-theme-style';

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    s /= 100;
    l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

function hslToHex(h: number, s: number, l: number): string {
    return rgbToHex(...hslToRgb(h, s, l));
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const l = (max + min) / 2;
    if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) };
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return { h: Math.round(h * 60), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function generateRandomColor(): string {
    const h = Math.floor(Math.random() * 360);
    const s = 40 + Math.floor(Math.random() * 40); // 40-80
    return hslToHex(h, s, 60);
}

export function computeAccentHex(color: string): string {
    const { h, s } = hexToHsl(color);
    return hslToHex(h, s, Math.max(55, hexToHsl(color).l));
}

/**
 * The "custom dark" theme for one picked colour: only the palette inputs
 * (see palette.css, which derives every popup and footer token from them).
 * The accent is the colour itself, the ground and text are its hue desaturated,
 * borders and hover washes take the complementary-ish secondary hue, and the
 * quiet surface washes the accent's.
 */
export function generateThemeCSS(color: string): string {
    const { h, s, l } = hexToHsl(color);
    const accentL = Math.max(55, l);
    const baseHue = (h - 10 + 360) % 360;
    const secondaryHue = (h + 135) % 360;

    const bgHex = hslToHex(baseHue, Math.round(s * 0.25), 8);
    const textHex = hslToHex(baseHue, Math.round(s * 0.35), 87);
    const accentHex = hslToHex(h, s, accentL);
    const lineHex = hslToHex(secondaryHue, Math.max(10, s - 10), Math.max(50, accentL - 5));

    return `.theme-custom-dark {
  --theme-ground: ${bgHex};
  --theme-text: ${textHex};
  --theme-accent: ${accentHex};
  --theme-line: ${lineHex};
  --theme-tint: ${accentHex};
  --theme-success: ${hslToHex(135, 48, 55)};
  --theme-warning: ${hslToHex(43, 75, 55)};
  --theme-danger: ${hslToHex(5, 65, 55)};
  --theme-data-shift: 15%;
}`;
}

export function applyCustomTheme(color: string): void {
    removeCustomTheme();
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = generateThemeCSS(color);
    document.head.appendChild(style);
}

export function removeCustomTheme(): void {
    document.getElementById(STYLE_ID)?.remove();
}
