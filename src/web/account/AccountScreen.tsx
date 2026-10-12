import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { Notice, Segmented, Select } from "@web-ui/primitives/index.ts";
import {
    type AccountOptions,
    DECLENSION_CASES,
    GENDER_FEMALE,
    adjectivesFor,
    capitalize,
    describeInstrumental,
    generateName,
    isPrintableAscii,
    isValidEmail,
    isValidName,
    pickTwoAdjectives,
    startlocLocative,
} from "@web/account/accountProtocol.ts";
import type { AccountSession, AccountTab, NoticeScope } from "@web/account/accountSession.ts";
import "./account.css";

/*
The screens that take the login card's place for an account: creating one,
and once logged in, its characters, a new character, and its settings. The
state and every request live in AccountSession; this only draws it.
*/

type Session = { session: AccountSession };

export function AccountScreen({ session }: Session) {
    const state = useSyncExternalStore(session.subscribe, session.getState);
    if (state.view === 'create-account') return <CreateAccount session={session} />;
    if (state.view === 'account') return <Account session={session} />;
    return null;
}

function useAccountState(session: AccountSession) {
    return useSyncExternalStore(session.subscribe, session.getState);
}

function SessionNotice({ session, scope }: Session & { scope: NoticeScope }) {
    const notice = useAccountState(session).notices[scope];
    if (!notice) return null;
    return (
        <Notice variant={notice.variant} onClose={() => session.dismissNotice(scope)} className="account-notice">
            {notice.text}
        </Notice>
    );
}

/** Asks once more before something that cannot be taken back. */
function Confirm({ children, onYes, onNo, busy }: { children: ReactNode; onYes: () => void; onNo: () => void; busy: boolean }) {
    return (
        <div className="account-confirm" id="account-confirm">
            <div>{children}</div>
            <div className="account-confirm__actions">
                <button type="button" className="auth-btn auth-btn--solid auth-btn--sm" id="account-confirm-yes" disabled={busy} onClick={onYes}>Tak</button>
                <button type="button" className="auth-btn auth-btn--sm" onClick={onNo}>Nie</button>
            </div>
        </div>
    );
}

function TextField({ id, label, value, onChange, type = 'text', autoComplete, hint, error, autoFocus, readOnly }: {
    id: string;
    label: ReactNode;
    value: string;
    onChange?: (value: string) => void;
    type?: string;
    autoComplete?: string;
    hint?: ReactNode;
    error?: ReactNode;
    autoFocus?: boolean;
    readOnly?: boolean;
}) {
    return (
        <label className="auth-field">
            <span className="auth-label">{label}</span>
            <input
                id={id}
                className="auth-input"
                type={type}
                value={value}
                autoComplete={autoComplete ?? 'off'}
                spellCheck={false}
                autoFocus={autoFocus}
                readOnly={readOnly}
                onChange={(e) => onChange?.(e.target.value)}
            />
            {error ? <span className="account-field-error">{error}</span> : hint ? <span className="account-field-hint">{hint}</span> : null}
        </label>
    );
}

// ── Załóż konto ──────────────────────────────────────────────────────────

function CreateAccount({ session }: Session) {
    const { busy } = useAccountState(session);
    const [email, setEmail] = useState('');
    const [confirming, setConfirming] = useState(false);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (!email) return session.reject('create-account', 'Musisz podać adres e-mail, do którego zostanie przypisane nowe konto.');
        if (!isValidEmail(email)) return session.reject('create-account', 'Musisz podać poprawny adres e-mail.');
        session.dismissNotice('create-account');
        setConfirming(true);
    };

    return (
        <form className="account" id="account-create-account" onSubmit={submit}>
            <h1 className="auth-title">Załóż konto</h1>
            <p className="auth-dim account-lead">
                Konto zbiera wszystkie Twoje postacie. Hasło do niego przyjdzie na podany adres e-mail.
            </p>
            <SessionNotice session={session} scope="create-account" />
            <TextField id="account-create-email" label="Adres e-mail" type="email" autoComplete="email" autoFocus value={email}
                onChange={(value) => { setEmail(value); setConfirming(false); }} />
            {confirming ? (
                <Confirm busy={busy} onNo={() => setConfirming(false)} onYes={() => { setConfirming(false); session.createAccount(email); }}>
                    Czy adres <strong>{email}</strong> jest na pewno poprawny?
                </Confirm>
            ) : (
                <button type="submit" className="auth-btn auth-btn--solid auth-btn--lg" disabled={busy}>Załóż konto</button>
            )}
            <button type="button" className="auth-btn auth-btn--link" id="account-back" onClick={() => session.leave()}>‹ Wróć do logowania</button>
        </form>
    );
}

// ── Konto ────────────────────────────────────────────────────────────────

const TABS: { value: AccountTab; label: string }[] = [
    { value: 'chars', label: 'Postacie' },
    { value: 'create', label: 'Nowa postać' },
    { value: 'settings', label: 'Konto' },
];

function Account({ session }: Session) {
    const { info, tab } = useAccountState(session);
    return (
        <div className="account" id="account-screen">
            <div className="account-head">
                <div className="account-head__who">
                    <span className="auth-cap">Konto</span>
                    <span className="account-head__email">{info?.email ?? '…'}</span>
                </div>
                <button type="button" className="auth-btn auth-btn--ghost auth-btn--sm" id="account-logout" onClick={() => session.leave()}>Wyloguj</button>
            </div>
            <SessionNotice session={session} scope="welcome" />
            <Segmented name="account-tab" value={tab} options={TABS} onChange={(next) => session.setTab(next)} />
            {tab === 'chars' && <Chars session={session} />}
            {tab === 'create' && <CreateChar session={session} />}
            {tab === 'settings' && <Settings session={session} />}
        </div>
    );
}

function Chars({ session }: Session) {
    const { info, busy } = useAccountState(session);
    if (!info) return <div className="account-loading"><span className="auth-spinner" />Wczytywanie konta…</div>;
    return (
        <div className="account-section" id="account-chars">
            <SessionNotice session={session} scope="chars" />
            {info.chars.length === 0 ? (
                <div className="account-empty">
                    <span className="auth-dim">Na tym koncie nie ma jeszcze żadnej postaci.</span>
                    <button type="button" className="auth-btn auth-btn--solid" onClick={() => session.setTab('create')}>Stwórz postać</button>
                </div>
            ) : (
                <ul className="account-chars">
                    {info.chars.map((char) => (
                        <li key={char.name} className={char.blocked ? 'account-char is-blocked' : 'account-char'} data-char={char.name}>
                            <span className="account-char__name">{capitalize(char.name)}</span>
                            {char.blocked && <span className="account-char__badge">zablokowana</span>}
                            <button type="button" className="auth-btn auth-btn--ghost auth-btn--sm account-char__block" disabled={busy}
                                title={char.blocked ? 'Odblokuj postać' : 'Zablokuj postać'}
                                onClick={() => session.setCharBlocked(char.name, !char.blocked)}>
                                {char.blocked ? 'Odblokuj' : 'Zablokuj'}
                            </button>
                            <button type="button" className="auth-btn auth-btn--solid auth-btn--sm account-char__play" disabled={busy || char.blocked}
                                onClick={() => session.loginChar(char.name)}>
                                Graj
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ── Nowa postać ──────────────────────────────────────────────────────────

const EMPTY_DECLENSION = ['', '', '', '', ''];

function CreateChar({ session }: Session) {
    const { options, busy, nameError } = useAccountState(session);
    if (!options || options.races.length === 0) {
        return <div className="account-loading"><span className="auth-spinner" />Wczytywanie ras i wyglądu…</div>;
    }
    return <CreateCharForm session={session} options={options} busy={busy} nameError={nameError} />;
}

function CreateCharForm({ session, options, busy, nameError }: Session & { options: AccountOptions; busy: boolean; nameError: string | null }) {
    const [race, setRace] = useState(options.races[0].val);
    const [gender, setGender] = useState(options.genders[0]?.val ?? 0);
    const [startloc, setStartloc] = useState(options.startlocs[0]?.val ?? 0);
    const adjectives = useMemo(() => adjectivesFor(options, race, gender), [options, race, gender]);
    const [[first, second], setPair] = useState<[string, string]>(() => pickTwoAdjectives(adjectives));
    const [name, setName] = useState('');
    const [declension, setDeclension] = useState<string[]>(EMPTY_DECLENSION);
    const [confirming, setConfirming] = useState(false);

    // A race or gender that cannot take an adjective trades it for one it can.
    useEffect(() => {
        if (adjectives.length < 2) return;
        const has = (val: string) => adjectives.some((a) => a.val === val);
        if (has(first) && has(second) && first !== second) return;
        const [a, b] = pickTwoAdjectives(adjectives);
        const keepFirst = has(first) ? first : a;
        setPair([keepFirst, has(second) && second !== keepFirst ? second : (b !== keepFirst ? b : a)]);
    }, [adjectives, first, second]);

    useEffect(() => setConfirming(false), [race, gender, startloc, first, second, name, declension]);

    const raceText = options.races.find((r) => r.val === race)?.text ?? '';
    const startlocText = options.startlocs.find((s) => s.val === startloc)?.text ?? '';
    const female = gender === GENDER_FEMALE;

    const changeName = (value: string) => {
        setName(value);
        session.checkName(value);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const reject = (text: string) => session.reject('create', text);
        if (!name) return reject('Musisz wybrać imię dla postaci.');
        if (!isValidName(name)) return reject('Imię zawiera niedozwolone znaki.');
        if (declension.some((form) => !form)) return reject('Musisz podać poprawną odmianę imienia.');
        if (declension.some((form) => !isValidName(form))) return reject('Odmiana imienia zawiera niedozwolone znaki.');
        if (!first || !second || first === second) return reject('Musisz wybrać dwa różne przymiotniki opisujące wygląd postaci.');
        session.dismissNotice('create');
        setConfirming(true);
    };

    const create = () => {
        setConfirming(false);
        const forms = [name, ...declension] as [string, string, string, string, string, string];
        session.createChar({ name_declension: forms, race, gender, adjectives: [first, second], startloc });
    };

    const adjectiveOptions = useMemo(() => {
        const groups = new Map<string, typeof adjectives>();
        adjectives.forEach((a) => {
            const key = a.group ?? '';
            groups.set(key, [...(groups.get(key) ?? []), a]);
        });
        return [...groups].map(([group, list]) => (group
            ? <optgroup key={group} label={capitalize(group)}>{list.map((a) => <option key={a.val} value={a.val}>{a.text}</option>)}</optgroup>
            : list.map((a) => <option key={a.val} value={a.val}>{a.text}</option>)));
    }, [adjectives]);

    // The other select's adjective, picked here, trades places with this one.
    const pickFirst = (value: string) => setPair(value === second ? [value, first] : [value, second]);
    const pickSecond = (value: string) => setPair(value === first ? [second, value] : [first, value]);

    return (
        <form className="account-section account-create" id="account-create-char" onSubmit={submit}>
            <div className="account-grid">
                <label className="auth-field">
                    <span className="auth-label">Rasa</span>
                    <Select id="account-race" value={race} onChange={(e) => setRace(Number(e.target.value))}>
                        {options.races.map((r) => <option key={r.val} value={r.val}>{capitalize(r.text)}</option>)}
                    </Select>
                </label>
                <div className="auth-field">
                    <span className="auth-label">Płeć</span>
                    <Segmented name="account-gender" value={String(gender)}
                        options={options.genders.map((g) => ({ value: String(g.val), label: capitalize(g.text) }))}
                        onChange={(value) => setGender(Number(value))} />
                </div>
            </div>

            <div className="auth-field">
                <span className="auth-label account-label-row">
                    Wygląd
                    <button type="button" className="auth-btn auth-btn--link" id="account-random-look" onClick={() => setPair(pickTwoAdjectives(adjectives))}>Losuj</button>
                </span>
                <div className="account-grid">
                    <Select id="account-adjective-1" value={first} onChange={(e) => pickFirst(e.target.value)}>{adjectiveOptions}</Select>
                    <Select id="account-adjective-2" value={second} onChange={(e) => pickSecond(e.target.value)}>{adjectiveOptions}</Select>
                </div>
            </div>

            <label className="auth-field">
                <span className="auth-label account-label-row">
                    Imię
                    <button type="button" className="auth-btn auth-btn--link" id="account-random-name" onClick={() => changeName(generateName(raceText))}>Losuj</button>
                </span>
                <input id="account-name" className={nameError ? 'auth-input is-invalid' : 'auth-input'} value={name} autoComplete="off" spellCheck={false}
                    onChange={(e) => changeName(e.target.value)} />
                {/* Always one line, hint or the game's objection, so an answer never moves the form. */}
                {nameError
                    ? <span className="account-name-status account-field-error" id="account-name-error" title={nameError}>{nameError}</span>
                    : <span className="account-name-status account-field-hint">Same litery, bez polskich znaków.</span>}
            </label>

            <div className="auth-field">
                <span className="auth-label">Odmiana imienia</span>
                <div className="account-declension">
                    {DECLENSION_CASES.slice(1).map((c, i) => (
                        <label key={c.key} className="account-declension__row">
                            <span className="account-declension__case">{c.label} <span className="auth-muted">{c.hint}</span></span>
                            <input id={`account-decl-${c.key}`} className="auth-input" value={declension[i]} autoComplete="off" spellCheck={false}
                                placeholder={name ? capitalize(name) : ''}
                                onChange={(e) => setDeclension(declension.map((form, j) => (j === i ? e.target.value : form)))} />
                        </label>
                    ))}
                </div>
            </div>

            <label className="auth-field">
                <span className="auth-label">Początek przygody</span>
                <Select id="account-startloc" value={startloc} onChange={(e) => setStartloc(Number(e.target.value))}>
                    {options.startlocs.map((s) => <option key={s.val} value={s.val}>{capitalize(s.text)}</option>)}
                </Select>
            </label>

            <SessionNotice session={session} scope="create" />
            {confirming ? (
                <Confirm busy={busy} onYes={create} onNo={() => setConfirming(false)}>
                    Twoja postać będzie {describeInstrumental(raceText, gender, first, second)}, znan{female ? 'ą' : 'ym'} jako <strong>{capitalize(name)}</strong>.
                    {' '}Rozpocznie swoją przygodę w {startlocLocative(startlocText)}. Czy wszystko się zgadza?
                </Confirm>
            ) : (
                <button type="submit" className="auth-btn auth-btn--solid auth-btn--lg" id="account-create-submit" disabled={busy}>Stwórz postać</button>
            )}
        </form>
    );
}

// ── Ustawienia konta ─────────────────────────────────────────────────────

const formatTime = (seconds?: number) => (seconds ? new Date(seconds * 1000).toLocaleString('pl-PL') : null);

function Settings({ session }: Session) {
    const { info } = useAccountState(session);
    if (!info) return <div className="account-loading"><span className="auth-spinner" />Wczytywanie konta…</div>;
    const created = formatTime(info.creation_time);
    const lastLogin = formatTime(info.login_time);
    return (
        <div className="account-section" id="account-settings">
            <dl className="account-details">
                {info.email && <><dt>Adres e-mail</dt><dd>{info.email}</dd></>}
                {created && <><dt>Data założenia</dt><dd>{created}</dd></>}
                {lastLogin && <><dt>Ostatnie logowanie</dt><dd>{lastLogin}{info.login_from && <span className="auth-muted"> z {info.login_from}</span>}</dd></>}
            </dl>
            <ChangeEmail session={session} />
            <ChangePassword session={session} />
            <BlockAccount session={session} />
        </div>
    );
}

function ChangeEmail({ session }: Session) {
    const { busy, notices } = useAccountState(session);
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState('');
    useEffect(() => {
        if (notices.email?.variant === 'success') { setPassword(''); setEmail(''); }
    }, [notices.email]);
    const submit = (e: FormEvent) => {
        e.preventDefault();
        const reject = (text: string) => session.reject('email', text);
        if (!password || !isPrintableAscii(password)) return reject('Musisz podać poprawne hasło.');
        if (!email) return reject('Musisz podać nowy adres e-mail dla konta.');
        if (!isValidEmail(email)) return reject('Musisz podać poprawny adres e-mail.');
        session.changeEmail(password, email);
    };
    return (
        <form className="account-block" id="account-change-email" onSubmit={submit}>
            <h2 className="account-block__title">Zmiana adresu e-mail</h2>
            <SessionNotice session={session} scope="email" />
            <div className="account-grid">
                <TextField id="account-email-new" label="Nowy adres e-mail" type="email" value={email} onChange={setEmail} />
                <TextField id="account-email-password" label="Hasło" type="password" autoComplete="current-password" value={password} onChange={setPassword} />
            </div>
            <button type="submit" className="auth-btn" disabled={busy}>Zmień adres</button>
        </form>
    );
}

function ChangePassword({ session }: Session) {
    const { busy, notices } = useAccountState(session);
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [repeat, setRepeat] = useState('');
    useEffect(() => {
        if (notices.password?.variant === 'success') { setCurrent(''); setNext(''); setRepeat(''); }
    }, [notices.password]);
    const submit = (e: FormEvent) => {
        e.preventDefault();
        const reject = (text: string) => session.reject('password', text);
        if (!current) return reject('Musisz podać dotychczasowe hasło.');
        if (!isPrintableAscii(current)) return reject('Wprowadzone stare hasło zawiera niedozwolone znaki.');
        if (!next) return reject('Musisz podać nowe hasło.');
        if (!repeat) return reject('Musisz jeszcze raz podać nowe hasło.');
        if (!isPrintableAscii(next)) return reject('Wprowadzone nowe hasło zawiera niedozwolone znaki.');
        if (next !== repeat) return reject('Musisz podać to samo nowe hasło w obu polach.');
        session.changePassword(current, next);
    };
    return (
        <form className="account-block" id="account-change-password" onSubmit={submit}>
            <h2 className="account-block__title">Zmiana hasła</h2>
            <SessionNotice session={session} scope="password" />
            <TextField id="account-password-old" label="Obecne hasło" type="password" autoComplete="current-password" value={current} onChange={setCurrent} />
            <div className="account-grid">
                <TextField id="account-password-new" label="Nowe hasło" type="password" autoComplete="new-password" value={next} onChange={setNext} />
                <TextField id="account-password-repeat" label="Powtórz nowe hasło" type="password" autoComplete="new-password" value={repeat} onChange={setRepeat} />
            </div>
            <button type="submit" className="auth-btn" disabled={busy}>Zmień hasło</button>
        </form>
    );
}

function BlockAccount({ session }: Session) {
    const { busy, info, notices } = useAccountState(session);
    const [until, setUntil] = useState('');
    const [password, setPassword] = useState('');
    useEffect(() => {
        if (notices.block?.variant === 'success') { setUntil(''); setPassword(''); }
    }, [notices.block]);
    const submit = (e: FormEvent) => {
        e.preventDefault();
        const reject = (text: string) => session.reject('block', text);
        if (!password || !isPrintableAscii(password)) return reject('Musisz podać poprawne hasło.');
        const time = Math.floor(new Date(until).getTime() / 1000);
        if (!until || Number.isNaN(time)) return reject('Musisz podać datę i godzinę końca blokady konta.');
        session.blockAccount(time, password);
    };
    return (
        <form className="account-block" id="account-block" onSubmit={submit}>
            <h2 className="account-block__title">Blokada konta</h2>
            <SessionNotice session={session} scope="block" />
            {info?.blocked ? (
                <>
                    <span className="auth-dim">Konto jest zablokowane: nie zalogujesz się na żadną jego postać, dopóki blokada trwa.</span>
                    <button type="button" className="auth-btn" id="account-unblock" disabled={busy} onClick={() => session.unblockAccount()}>Odblokuj konto</button>
                </>
            ) : (
                <>
                    <span className="auth-dim">Na wybrany czas nie zalogujesz się na żadną postać z tego konta, np. by odpocząć od gry.</span>
                    <div className="account-grid">
                        <TextField id="account-block-until" label="Do kiedy" type="datetime-local" value={until} onChange={setUntil} />
                        <TextField id="account-block-password" label="Hasło" type="password" autoComplete="current-password" value={password} onChange={setPassword} />
                    </div>
                    <button type="submit" className="auth-btn auth-btn--danger" disabled={busy}>Zablokuj konto</button>
                </>
            )}
        </form>
    );
}
