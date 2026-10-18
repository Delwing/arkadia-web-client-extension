/**
 * The Kuźnia theme's login screen, the part CSS cannot do alone: the forge
 * burning behind it (a hearth glow and a field of rising embers), the password
 * cooling into its dots as it is typed, and the connection folded under a
 * named hairline. The pieces are always there; themes/forged/login.css shows
 * them, so switching the theme needs nothing from here.
 */

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The count follows the viewport width: a field tuned on a 1400px laptop is a
 * scattering of unrelated dots across 2560px. Under 24 it stops being a
 * field, over 36 it starts being weather.
 */
const emberCount = () => Math.round(Math.min(36, Math.max(24, window.innerWidth / 64)));

/**
 * One ember's numbers. Generated so no two embers share a duration, a delay,
 * a drift or a brightness - a field that rhymes reads as a particle effect,
 * not as fire.
 */
function makeEmber(): HTMLElement {
    const x = Math.random() * 100;
    // The logo owns the middle and must stay the brightest thing there: embers
    // in that band are 1px and dimmed rather than left out (a bare corridor
    // reads as a bug).
    const centre = x > 36 && x < 64;
    // Mostly 1px; a 3px ember is the rare one, close to the viewer.
    const size = centre ? 1 : Math.round(mix(1, 3, Math.pow(Math.random(), 1.45)));
    // Big and bright at once is a spark, showier than this screen wants.
    const peak = mix(0.3, 0.78, Math.pow(Math.random(), 1.25))
        * (centre ? 0.42 : 1)
        * (size > 2 ? 0.6 : size > 1 ? 0.8 : 1);
    // 9-22s: slow is what tells embers from rain.
    const dur = mix(9, 22, Math.random());
    const ember = document.createElement('span');
    ember.className = 'auth-ember';
    const vars: Record<string, string> = {
        '--x': `${x.toFixed(2)}%`,
        '--size': `${size}px`,
        '--peak': peak.toFixed(3),
        '--dur': `${dur.toFixed(2)}s`,
        // Never a whole fraction of --dur, or every ember traces the same S.
        '--sway': `${mix(3.7, 7.9, Math.random()).toFixed(2)}s`,
        '--drift': `${(mix(4, 15, Math.random()) * (Math.random() < 0.5 ? -1 : 1)).toFixed(1)}px`,
        // Short of the top edge, and burnt out by 84% of the climb.
        '--rise': `${mix(50, 76, Math.random()).toFixed(1)}vh`,
        // Negative: the field is mid-flight on the first frame, not filling up.
        '--delay': `${(-Math.random() * dur).toFixed(2)}s`,
        // Where it freezes under reduced motion, so the still frame is a field.
        '--settle': mix(0.12, 0.82, Math.random()).toFixed(3),
    };
    for (const [name, value] of Object.entries(vars)) ember.style.setProperty(name, value);
    ember.appendChild(document.createElement('i'));
    return ember;
}

function lightTheForge(overlay: HTMLElement): void {
    const hearth = document.createElement('div');
    hearth.className = 'auth-hearth';
    hearth.append(document.createElement('i'), document.createElement('i'));
    const embers = document.createElement('div');
    embers.className = 'auth-embers';
    for (let i = 0; i < emberCount(); i++) embers.appendChild(makeEmber());
    overlay.prepend(hearth, embers);
}

/**
 * `inputType` is the honest signal; length deltas lie (select-all-then-type
 * shrinks the field and is still one strike). No inputType means nobody typed
 * (a password manager, a restored form): only then fall back to the delta.
 */
function classifyHeat(len: number, prev: number, inputType?: string, data?: string | null): 'cold' | 'strike' | 'bulk' {
    if (!len) return 'cold';
    if (!inputType) return len - prev === 1 ? 'strike' : len > prev ? 'bulk' : 'cold';
    if (!inputType.startsWith('insert')) return 'cold';
    if (inputType === 'insertText' && (data == null || data.length === 1)) return 'strike';
    return data && data.length === 1 ? 'strike' : 'bulk';
}

// Everything that decides where a glyph lands - never the colour, the mask has its own.
const MIRROR = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
    'textIndent', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
] as const;

/**
 * The password cools into dots: a row of bullets painted over the real input,
 * which only loses its ink. The input stays intact - password managers,
 * autofill, paste, selection and the caret remain the browser's - and the row
 * is driven by the value's LENGTH alone, every glyph the same bullet, so it
 * can never spell what was typed.
 */
function forgeThePassword(input: HTMLInputElement): void {
    const host = input.parentElement;
    if (!host) return;
    const mask = document.createElement('span');
    mask.className = 'auth-mask';
    host.appendChild(mask);

    // Geometry is copied off the live input rather than restated in CSS: some
    // of it belongs to the user agent, and a webfont landing moves it.
    const place = () => {
        const cs = getComputedStyle(input);
        for (const prop of MIRROR) mask.style[prop] = cs[prop];
        mask.style.left = `${input.offsetLeft}px`;
        mask.style.top = `${input.offsetTop}px`;
        mask.style.width = `${input.offsetWidth}px`;
        mask.style.height = `${input.offsetHeight}px`;
    };
    new ResizeObserver(place).observe(input);
    void document.fonts?.ready.then(place);
    input.addEventListener('scroll', () => { mask.scrollLeft = input.scrollLeft; });

    let shown = 0;
    const render = (heat: { index: number; bulk: boolean } | null) => {
        const length = input.value.length;
        mask.textContent = '';
        for (let i = 0; i < length; i++) {
            const glyph = document.createElement('span');
            glyph.className = 'auth-glyph';
            if (heat?.bulk) glyph.classList.add('is-bulk');
            else if (heat && heat.index === i) glyph.classList.add('is-hot');
            glyph.textContent = '•';
            mask.appendChild(glyph);
        }
        shown = length;
        mask.scrollLeft = input.scrollLeft;
    };

    input.addEventListener('input', (event) => {
        const native = event as InputEvent;
        const length = input.value.length;
        const mode = classifyHeat(length, shown, native.inputType, native.data);
        // Deleting is silent: heat means metal was added, and a held backspace
        // would strobe the field.
        const caret = input.selectionEnd ?? length;
        render(mode === 'cold' ? null : { index: caret - 1, bulk: mode === 'bulk' });
    });
    // A value set from code (a wrong password clears it) raises no input event.
    for (const type of ['focus', 'blur', 'change']) {
        input.addEventListener(type, () => { if (input.value.length !== shown) render(null); });
    }
    render(null);
}

export function setupLoginFire(): void {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) lightTheForge(overlay);

    const password = document.getElementById('login-password') as HTMLInputElement | null;
    if (password) forgeThePassword(password);

    const fold = document.getElementById('auth-conn-fold');
    const conn = document.getElementById('proxy-controls-root');
    fold?.addEventListener('click', () => {
        const open = !conn?.classList.contains('is-open');
        conn?.classList.toggle('is-open', open);
        fold.classList.toggle('is-open', open);
    });
}
