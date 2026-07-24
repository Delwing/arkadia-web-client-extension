import { useEffect, useMemo, useRef, useState } from 'react';
import mudClient, { type ProxyMode } from '@web/MudClient';
import { useConnectionState } from '../client/ConnectionContext';
import useForgedMask from '../hooks/useForgedMask';

const ROUTES: { mode: ProxyMode; label: string; hint: string }[] = [
    { mode: 'direct', label: 'Bezpośrednio', hint: 'Prosto do serwera Arkadii.' },
    { mode: 'helper', label: 'Pomocnik', hint: 'Przez aplikację pomocnika na tym komputerze.' },
    { mode: 'proxy', label: 'Proxy', hint: 'Przez serwer pośredniczący.' },
];

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The count follows the viewport width rather than being a constant: a field
 * tuned on a 1400px laptop is a scattering of unrelated dots across 2560px.
 * Clamped at both ends — under 24 it stops being a field, over 36 it starts
 * being weather.
 */
const emberCount = () => Math.round(Math.min(36, Math.max(24, window.innerWidth / 64)));

/**
 * One ember's worth of numbers. Generated rather than authored because the
 * whole point of the field is that no two embers share a duration, a delay, a
 * drift or a brightness — a hand-written field of this size always ends up
 * rhyming, and a field that rhymes is what makes someone think "particle
 * effect" instead of "fire".
 */
function makeEmber(): React.CSSProperties {
    const x = Math.random() * 100;
    // The logo owns the middle of the screen and must stay the brightest thing
    // on it. Embers are NOT excluded from that band — a bare corridor down the
    // centre of a wide viewport reads as a bug — they are made 1px and dropped
    // to a fraction of their brightness there instead.
    const centre = x > 36 && x < 64;
    // Biased hard toward 1px: a 3px ember is the rare one, close to the viewer.
    // An even spread of sizes flattens the field into a single plane of dots.
    const size = centre ? 1 : Math.round(mix(1, 3, Math.pow(Math.random(), 1.45)));
    // The bigger an ember is the dimmer it is allowed to be: big AND bright at
    // once is a spark, which is a showier object than this screen wants.
    const peak =
        mix(0.3, 0.78, Math.pow(Math.random(), 1.25)) *
        (centre ? 0.42 : 1) *
        (size > 2 ? 0.6 : size > 1 ? 0.8 : 1);
    // 9-22s. Slow is what separates embers from rain: much under ~8s and the
    // eye reads the motion as travel rather than as air moving.
    const dur = mix(9, 22, Math.random());
    return {
        '--x': `${x.toFixed(2)}%`,
        '--size': `${size}px`,
        '--peak': peak.toFixed(3),
        '--dur': `${dur.toFixed(2)}s`,
        '--sway': `${mix(3.7, 7.9, Math.random()).toFixed(2)}s`, // never a whole fraction of --dur
        '--drift': `${(mix(4, 15, Math.random()) * (Math.random() < 0.5 ? -1 : 1)).toFixed(1)}px`,
        // Rise stops well short of the top edge, and emberBurn has already taken
        // the opacity to 0 by 84% of it — belt and braces against an ember
        // reaching the ceiling, the one failure that looks broken rather quiet.
        '--rise': `${mix(50, 76, Math.random()).toFixed(1)}vh`,
        // Negative: the field is already mid-flight on the first frame. A cold
        // user must not meet an empty screen that slowly fills up — that reads
        // as the page still loading, the exact opposite of the intended message.
        '--delay': `${(-Math.random() * dur).toFixed(2)}s`,
        // Only read under prefers-reduced-motion, where each ember has to freeze
        // at a different height or the still frame becomes a row of dots.
        '--settle': mix(0.12, 0.82, Math.random()).toFixed(3),
    } as React.CSSProperties;
}

/** What the browser says just happened to the password field. */
type Heat = { index: number; seq: number; bulk: boolean } | null;

/**
 * `inputType` is the honest signal; length deltas lie — select-all-then-type
 * SHRINKS the field and is still a single strike. Missing inputType means
 * nobody typed (a manager, a script, a restored form), so fall back to the
 * delta there and only there.
 */
function classifyHeat(len: number, prev: number, inputType?: string, data?: string | null) {
    if (!len) return 'cold';
    if (!inputType) return len - prev === 1 ? 'strike' : len > prev ? 'bulk' : 'cold';
    if (!inputType.startsWith('insert')) return 'cold'; // delete*, history*, format*
    if (inputType === 'insertText' && (data == null || data.length === 1)) return 'strike';
    return data && data.length === 1 ? 'strike' : 'bulk'; // paste, drop, IME commit
}

/**
 * The login screen: the one thing you see before the HUD has a game behind it.
 *
 * Deliberately not a panel — the logo is the only lit object on the page and
 * everything under it is hairline-quiet, so the screen has a single focus. The
 * fields are rules rather than boxes because forge's own command trough is the
 * only inset field in this UI, and reserving that shape for "the game is
 * listening" keeps it meaningful.
 *
 * All connection behaviour comes from the shared ConnectionEngine via
 * <ConnectionProvider>; this component only collects two strings and decides
 * what is on screen. It renders nothing at all while connected, and can be
 * pushed aside (`dismiss`) after a mid-session drop so the log stays readable —
 * the footer's <ReconnectChip> is how you get back, which is what replaced the
 * old connect button printed into the log itself.
 */
export default function LoginGate() {
    const { phase, notice, engine, dismissed, dismiss } = useConnectionState();
    const [character, setCharacter] = useState('');
    const [password, setPassword] = useState('');
    const [foldOpen, setFoldOpen] = useState(false);
    const [mccp, setMccp] = useState(() => mudClient.isMccpEnabled());
    const [route, setRoute] = useState<ProxyMode>(() => mudClient.getProxyMode());
    const [proxyUrl, setProxyUrl] = useState(() => mudClient.getUserProxyUrl() ?? '');
    const characterRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const maskRef = useRef<HTMLSpanElement>(null);
    // Which glyph is still cooling. `seq` only exists to give the hot span a
    // fresh key, so React remounts it and the animation re-arms when the same
    // index is struck twice in a row.
    const [heat, setHeat] = useState<Heat>(null);
    const seqRef = useRef(0);

    const connecting = phase === 'connecting';
    const visible = phase !== 'online' && !dismissed;

    // A fresh field per showing of the gate, and never rebuilt while it is up:
    // regenerating mid-session would restart every ember's climb at once.
    const embers = useMemo(() => Array.from({ length: emberCount() }, makeEmber), []);

    useForgedMask(passwordRef, maskRef, visible, password.length);

    useEffect(() => {
        if (visible && !connecting) characterRef.current?.focus();
    }, [visible, connecting]);

    // Hide the HUD while the gate is up — see the `.gate-open` rules in
    // login.css for why this is a body class rather than a scrim.
    useEffect(() => {
        if (!visible) return;
        document.body.classList.add('gate-open');
        return () => document.body.classList.remove('gate-open');
    }, [visible]);

    // Escape is the same escape hatch the `Pomiń` control is — push the gate
    // aside to read the log. Ignored mid-connect: pressing it while the socket
    // is opening would hide the one screen telling you it is.
    useEffect(() => {
        if (!visible || connecting) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') dismiss();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [visible, connecting, dismiss]);

    if (!visible) return null;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (connecting) return;
        // Read the credentials straight off the DOM, not React state. A password
        // manager that fills both fields and auto-submits in the same tick beats
        // React's onChange flush, so the controlled `character`/`password` here
        // would still hold their pre-fill (empty) values and we'd sign in blank.
        // The stock login sidesteps this by reading `.value` at submit time
        // (src/web/main.ts); mirror that so manager auto-submit lands.
        const enteredCharacter = (characterRef.current?.value ?? character).trim();
        const enteredPassword = passwordRef.current?.value ?? password;
        engine.signIn({ character: enteredCharacter, password: enteredPassword });
        // The password has been handed to the engine, which holds it only until
        // the server asks for it. Drop our copy immediately.
        setPassword('');
        setHeat(null);
    };

    const changeRoute = (mode: ProxyMode) => {
        setRoute(mode);
        mudClient.setProxyMode(mode);
    };

    const typePassword = (e: React.ChangeEvent<HTMLInputElement>) => {
        const native = e.nativeEvent as InputEvent;
        const next = e.target.value;
        // Where the heat is: the character just placed, which is not always the
        // last one — you can type into the middle of a password.
        const caret = e.target.selectionEnd ?? next.length;
        const mode = classifyHeat(next.length, password.length, native.inputType, native.data);
        setPassword(next);
        // Deletion is silent on purpose. A flash on backspace reads as noise
        // rather than as a quench — holding the key repeats ~30 times a second
        // and the field would strobe — and heat here means metal was ADDED.
        setHeat(
            mode === 'cold'
                ? null
                : { index: caret - 1, seq: ++seqRef.current, bulk: mode === 'bulk' },
        );
    };

    return (
        <div className="gate">
            {/* The forge behind the glass. Children of the gate rather than of
                the page, so they exist exactly as long as it does — the HUD is
                a working surface with a scrolling log on it, and drifting
                lights over that would be actively hostile. */}
            <div className="gate-hearth">
                <i />
                <i />
            </div>
            <div className="gate-embers">
                {embers.map((style, i) => (
                    <span key={i} className="gate-ember" style={style}>
                        <i />
                    </span>
                ))}
            </div>
            {/* Always available, including on a cold start: the gate covers the
                whole HUD, and the menu (settings, editors, docs) lives in the
                command rail underneath it. Without a way past, none of the
                client would be reachable until you had a game to connect to. */}
            <button
                type="button"
                className="gate__close"
                title="Przeglądaj klienta bez łączenia"
                onClick={dismiss}
            >
                <span className="gate__close-lab">Pomiń</span>
                <span className="gate__close-x">✕</span>
            </button>
            {/* id/name mirror the stock login form (index.html: #login-form /
                #login-character / #login-password / #login-submit). Password
                managers fingerprint the form they were saved on — matching those
                ids is what lets a manager's auto-submit fire here, not just fill.
                Forge is a separate HTML entry, so there is no id clash with stock. */}
            <form id="login-form" className="gate__col" onSubmit={submit}>
                <img className="gate__logo" src="/logo.png" alt="Dargoth Client" />

                {notice && <p className="gate__notice">{notice}</p>}

                <div className="gate__fields">
                    <label className="gate__field">
                        <span className="gate__lab">Postać</span>
                        <span className="gate__rule">
                            <span className="prompt">&gt;</span>
                            <input
                                ref={characterRef}
                                id="login-character"
                                className="gate__inp"
                                name="character"
                                autoComplete="username"
                                spellCheck={false}
                                disabled={connecting}
                                value={character}
                                onChange={(e) => setCharacter(e.target.value)}
                            />
                        </span>
                    </label>
                    <label className="gate__field">
                        <span className="gate__lab">Hasło</span>
                        <span className="gate__rule">
                            <span className="prompt">&gt;</span>
                            <input
                                ref={passwordRef}
                                id="login-password"
                                className="gate__inp gate__pw"
                                type="password"
                                name="password"
                                autoComplete="current-password"
                                disabled={connecting}
                                value={password}
                                onChange={typePassword}
                            />
                            {/* The dots we paint over the (now inkless) input.
                                Every glyph is the same character the browser
                                would have masked with, in the same font, which
                                is what keeps the two rows on identical advances
                                — and what stops this row from ever spelling
                                anything. */}
                            <span className="gate__mask" ref={maskRef}>
                                {Array.from({ length: password.length }, (_, i) => {
                                    const hot = !!heat && !heat.bulk && heat.index === i;
                                    const bulk = !!heat && heat.bulk;
                                    return (
                                        <span
                                            key={
                                                hot
                                                    ? `h${heat.seq}`
                                                    : bulk
                                                      ? `b${heat.seq}-${i}`
                                                      : i
                                            }
                                            className={
                                                'gate__glyph' +
                                                (hot ? ' is-hot' : bulk ? ' is-bulk' : '')
                                            }
                                        >
                                            •
                                        </span>
                                    );
                                })}
                            </span>
                        </span>
                    </label>
                </div>

                <div className="gate__actions">
                    <button
                        type="submit"
                        id="login-submit"
                        className="gate__go"
                        disabled={connecting}
                    >
                        {connecting ? 'ŁĄCZENIE' : 'POŁĄCZ'}
                    </button>
                    <button
                        type="button"
                        className="gate__quiet"
                        disabled={connecting}
                        onClick={() => engine.connect()}
                    >
                        Połącz bez logowania
                    </button>
                </div>

                <button
                    type="button"
                    className={'gate__fold' + (foldOpen ? ' is-open' : '')}
                    onClick={() => setFoldOpen((open) => !open)}
                >
                    <span className="gate__fold-name">
                        Połączenie
                        {/* An SVG, not the Unicode arrowhead: U+2304/2303 sit off
                            centre inside their em box, so no line-height trick
                            reliably centres them against the label. A symmetric
                            box does, and it rotates cleanly between the two states
                            instead of swapping to a different glyph. */}
                        <svg className="gate__fold-chev" viewBox="0 0 10 6">
                            <path d="M1 1.2 5 4.8 9 1.2" />
                        </svg>
                    </span>
                </button>

                {foldOpen && (
                    <div className="gate__adv">
                        <div className="gate__routes">
                            {ROUTES.map((r) => (
                                <button
                                    key={r.mode}
                                    type="button"
                                    title={r.hint}
                                    className={'gate__route' + (route === r.mode ? ' is-on' : '')}
                                    onClick={() => changeRoute(r.mode)}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>
                        {route === 'proxy' && (
                            <label className="gate__field">
                                <span className="gate__lab">Adres proxy</span>
                                <span className="gate__rule">
                                    <input
                                        className="gate__inp"
                                        placeholder="domyślny"
                                        spellCheck={false}
                                        value={proxyUrl}
                                        onChange={(e) => {
                                            setProxyUrl(e.target.value);
                                            mudClient.setUserProxyUrl(e.target.value);
                                        }}
                                    />
                                </span>
                            </label>
                        )}
                        <label className="gate__check">
                            <input
                                type="checkbox"
                                checked={mccp}
                                onChange={(e) => {
                                    setMccp(e.target.checked);
                                    mudClient.setMccpEnabled(e.target.checked);
                                }}
                            />
                            <span>Kompresja MCCP</span>
                        </label>
                    </div>
                )}
            </form>
        </div>
    );
}
