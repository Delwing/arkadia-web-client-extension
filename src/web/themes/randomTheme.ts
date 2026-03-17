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

export function generateThemeCSS(color: string): string {
    const { h, s } = hexToHsl(color);
    const accentL = Math.max(55, hexToHsl(color).l);
    const baseHue = (h - 10 + 360) % 360;
    const secondaryHue = (h + 135) % 360;

    // Scale saturation for derived elements
    const bgSat = Math.round(s * 0.25);
    const textSat = Math.round(s * 0.35);
    const darkerL = Math.max(40, accentL - 15);
    const secondarySat = Math.max(10, s - 10);
    const secondaryL = Math.max(50, accentL - 5);

    const [ar, ag, ab] = hslToRgb(h, s, accentL);
    const [sr, sg, sb] = hslToRgb(secondaryHue, secondarySat, secondaryL);
    const [tr, tg, tb] = hslToRgb(baseHue, textSat, 87);
    const [dr, dg, db] = hslToRgb(h, s, darkerL);

    const [succR, succG, succB] = hslToRgb(135, 48, 55);
    const [warnR, warnG, warnB] = hslToRgb(43, 75, 55);
    const [dangR, dangG, dangB] = hslToRgb(5, 65, 55);

    const bgHex = hslToHex(baseHue, bgSat, 8);
    const textHex = hslToHex(baseHue, textSat, 87);
    const accentHex = hslToHex(h, s, accentL);
    const inputBgHex = hslToHex(baseHue, bgSat, 5);
    const footerBtnHex = hslToHex(baseHue, Math.round(s * 0.15), 13);

    const succHex = hslToHex(135, 48, 55);
    const succLightHex = hslToHex(135, 48, 65);
    const warnHex = hslToHex(43, 75, 55);
    const warnLightHex = hslToHex(43, 75, 65);
    const dangHex = hslToHex(5, 65, 55);
    const dangLightHex = hslToHex(5, 65, 65);
    const dangSoftHex = hslToHex(5, 60, 60);

    return `.theme-custom-dark {
  --bs-primary: var(--popup-accent);
  --bs-primary-rgb: ${ar}, ${ag}, ${ab};
  --popup-bg: ${bgHex};
  --popup-text: ${textHex};
  --popup-text-dim: rgba(${tr}, ${tg}, ${tb}, 0.5);
  --popup-text-dimmer: rgba(${tr}, ${tg}, ${tb}, 0.4);
  --popup-text-subtle: rgba(${tr}, ${tg}, ${tb}, 0.7);
  --popup-text-strong: rgba(${tr}, ${tg}, ${tb}, 0.9);
  --popup-text-faint: rgba(${tr}, ${tg}, ${tb}, 0.3);
  --popup-text-medium: rgba(${tr}, ${tg}, ${tb}, 0.6);
  --popup-text-bright: rgba(${tr}, ${tg}, ${tb}, 0.8);
  --popup-hover-bg: rgba(${sr}, ${sg}, ${sb}, 0.08);
  --popup-subtle-bg: rgba(${ar}, ${ag}, ${ab}, 0.04);
  --popup-section-bg: rgba(${ar}, ${ag}, ${ab}, 0.08);
  --popup-control-bg: rgba(${ar}, ${ag}, ${ab}, 0.1);
  --popup-control-hover-bg: rgba(${sr}, ${sg}, ${sb}, 0.12);
  --popup-control-active-bg: rgba(${sr}, ${sg}, ${sb}, 0.18);
  --popup-control-pressed-bg: rgba(${sr}, ${sg}, ${sb}, 0.22);
  --popup-border: rgba(${sr}, ${sg}, ${sb}, 0.15);
  --popup-border-subtle: rgba(${sr}, ${sg}, ${sb}, 0.08);
  --popup-border-control: rgba(${sr}, ${sg}, ${sb}, 0.18);
  --popup-border-strong: rgba(${sr}, ${sg}, ${sb}, 0.22);
  --popup-border-stronger: rgba(${sr}, ${sg}, ${sb}, 0.3);
  --popup-accent: ${accentHex};
  --popup-accent-bg: rgba(${ar}, ${ag}, ${ab}, 0.2);
  --popup-accent-hover-bg: rgba(${ar}, ${ag}, ${ab}, 0.3);
  --popup-accent-subtle-bg: rgba(${ar}, ${ag}, ${ab}, 0.15);
  --popup-accent-border: rgba(${ar}, ${ag}, ${ab}, 0.4);
  --popup-accent-dim-bg: rgba(${ar}, ${ag}, ${ab}, 0.12);
  --popup-accent-strong-bg: rgba(${dr}, ${dg}, ${db}, 0.15);
  --popup-accent-strong-hover-bg: rgba(${dr}, ${dg}, ${db}, 0.25);
  --popup-accent-strong-active-bg: rgba(${dr}, ${dg}, ${db}, 0.4);
  --popup-accent-team-bg: rgba(${dr}, ${dg}, ${db}, 0.08);
  --popup-accent-team-hover-bg: rgba(${dr}, ${dg}, ${db}, 0.15);
  --popup-success: ${succHex};
  --popup-success-light: ${succLightHex};
  --popup-success-bg: rgba(${succR}, ${succG}, ${succB}, 0.2);
  --popup-success-hover-bg: rgba(${succR}, ${succG}, ${succB}, 0.3);
  --popup-success-border: rgba(${succR}, ${succG}, ${succB}, 0.25);
  --popup-success-subtle-bg: rgba(${succR}, ${succG}, ${succB}, 0.1);
  --popup-success-active-bg: rgba(${succR}, ${succG}, ${succB}, 0.35);
  --popup-warning: ${warnHex};
  --popup-warning-light: ${warnLightHex};
  --popup-warning-border: rgba(${warnR}, ${warnG}, ${warnB}, 0.3);
  --popup-warning-bg: rgba(${warnR}, ${warnG}, ${warnB}, 0.2);
  --popup-warning-hover-bg: rgba(${warnR}, ${warnG}, ${warnB}, 0.32);
  --popup-danger: ${dangHex};
  --popup-danger-light: ${dangLightHex};
  --popup-danger-soft: ${dangSoftHex};
  --popup-danger-bg: rgba(${dangR}, ${dangG}, ${dangB}, 0.2);
  --popup-danger-hover-bg: rgba(${dangR}, ${dangG}, ${dangB}, 0.32);
  --popup-danger-subtle-bg: rgba(${dangR}, ${dangG}, ${dangB}, 0.1);
  --popup-danger-border: rgba(${dangR}, ${dangG}, ${dangB}, 0.28);
  --popup-danger-active-bg: rgba(${dangR}, ${dangG}, ${dangB}, 0.38);
  --popup-data-yellow: #e0d050;
  --popup-data-gold: #d0b838;
  --popup-data-green: #60cc60;
  --popup-data-green-light: #80de80;
  --popup-data-blue: #70b0d8;
  --popup-data-orange: #cc9838;
  --popup-data-orange-warm: #be9040;
  --popup-data-orange-light: #d4a230;
  --popup-data-pink: #cc8898;
  --popup-data-purple: #8880bb;
  --popup-data-purple-light: #a098cc;
  --popup-data-gray: #888898;
  --popup-data-gray-light: #a0a0a8;
  --popup-data-tomato: #c05848;
  --popup-data-magic-green: #40da80;
  --popup-data-spring-green: #38cc70;
  --popup-input-bg: ${inputBgHex};
  --popup-input-text: ${textHex};
  --popup-input-focus-border: rgba(${sr}, ${sg}, ${sb}, 0.45);
  --footer-bg: ${bgHex};
  --footer-border: rgba(${sr}, ${sg}, ${sb}, 0.15);
  --footer-control-bg: rgba(${ar}, ${ag}, ${ab}, 0.12);
  --footer-control-border: rgba(${sr}, ${sg}, ${sb}, 0.22);
  --footer-control-hover-bg: rgba(${sr}, ${sg}, ${sb}, 0.16);
  --footer-control-hover-border: rgba(${sr}, ${sg}, ${sb}, 0.4);
  --footer-button-bg: ${footerBtnHex};
  --footer-input-focus-border: ${accentHex};
  --footer-text-strong: rgba(${tr}, ${tg}, ${tb}, 0.95);
  --footer-text: rgba(${tr}, ${tg}, ${tb}, 0.8);
  --footer-text-dim: rgba(${tr}, ${tg}, ${tb}, 0.5);
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
