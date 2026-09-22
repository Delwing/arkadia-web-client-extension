// NOTE: this component does NOT import ../style.css. The stock UI already loads
// that stylesheet globally (main.ts → main-theme.css), so mounting here inside
// stock's modal is fully styled. forge-ui mounts the very same component in its
// own modal but must NOT pull stock's global sheet in — it's a page-wide sheet
// (#content-area, footer, badges, popups, …) that, once loaded, repaints
// forge's whole base UI. forge instead provides the modal chrome via its scoped
// bootstrap-compat.css. Re-adding this import would reintroduce that leak.
import {useState} from "react";
import {Button as UiButton, Check, DeleteButton, Field, Input, Select} from "@web-ui/primitives/index.ts";
import {CircleHelp} from "lucide-react";
import {defaultSettings} from "./defaultSettings";
import {CollectOverridesModal} from "./CollectOverridesModal";
import type {GeneralSettingsSectionProps} from "./useGeneralSettingsForm";

const collectModeOptions = [
    "zawsze",
    "lider",
    "wlasne",
    "nic",
];

const collectTimingOptions = [
    "na koniec (po zabiciu wszystkich)",
    "po kazdym zabiciu",
    "po kazdym zabiciu i na koniec",
];

const languageOptions = [
    "potoczna",
    "bretonski",
    "drukh-eltharin",
    "estalijski",
    "fan-eltharin",
    "gnomi",
    "grumbarth",
    "halflinski",
    "khazalid",
    "kislevicki",
    "krasnoludzki",
    "mroczna mowa",
    "nilfgaardzki",
    "norski",
    "reikspiel",
    "skelliganski",
    "starsza mowa",
    "tar-eltharin",
    "tileanski",
    "zerrikanski",
    "ghassall",
]

const lowHpAlertOptions = [
    {value: 0, label: '0 - Wylaczony'},
    {value: 1, label: '1 - Ledwo zywy'},
    {value: 2, label: '2 - Ciezko ranny'},
    {value: 3, label: '3 - W zlej kondycji'},
    {value: 4, label: '4 - Ranny'},
    {value: 5, label: '5 - Lekko ranny'},
    {value: 6, label: '6 - W dobrym stanie'},
    {value: 7, label: '7 - W swietnej kondycji'},
];

const LETTER_LINE_WIDTH_MIN = 40;
const LETTER_LINE_WIDTH_MAX = 120;

/** A (?) that explains an option on hover. */
function HelpHint({text}: {text: string}) {
    return <span className="settings-help" title={text}><CircleHelp size={14}/></span>;
}

export function ExitsSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    const prefix = settings.shortExitsPrefix ?? '-----:';
    const customPrefix = prefix !== '-----:' && prefix !== '→';
    return (
        <section className="character-settings-section">
            <h5 className="character-settings-section-title">Wyjścia</h5>
            <div className="character-settings-stack">
                <Field label="Roza wiatrow" htmlFor="inlineCompassRose">
                    <Select
                        id="inlineCompassRose"
                        className="settings-narrow"
                        value={settings.inlineCompassRose}
                        onChange={e => onChangeSetting(s => s.inlineCompassRose = Number(e.target.value))}
                    >
                        <option value={0}>Wyl.</option>
                        <optgroup label="Inline">
                            <option value={1}>Domyslna</option>
                            <option value={3}>ASCII</option>
                        </optgroup>
                        <optgroup label="Ramka">
                            <option value={2}>Domyslna</option>
                            <option value={4}>ASCII</option>
                        </optgroup>
                    </Select>
                </Field>
                <div className="settings-checks">
                    <Check
                        id="compassBackExits"
                        label="Powrót na czerwono"
                        checked={settings.compassBackExits}
                        onChange={e => onChangeSetting(s => s.compassBackExits = e.target.checked)}
                    />
                    <Check
                        id="shortenExits"
                        label="Skrócone wyjścia"
                        checked={settings.shortenExits}
                        onChange={e => onChangeSetting(s => s.shortenExits = e.target.checked)}
                    />
                </div>
            </div>
            {settings.shortenExits && (
                <div className="settings-subsection character-settings-stack">
                    <div className="settings-exits-grid">
                        <Field label="Przedrostek">
                            <div className="settings-checks">
                                <Check
                                    type="radio"
                                    id="format-compact"
                                    label='Kompaktowy (-----:)'
                                    name="shortExitsFormat"
                                    value="compact"
                                    checked={prefix === '-----:'}
                                    onChange={() => onChangeSetting(s => s.shortExitsPrefix = '-----:')}
                                />
                                <Check
                                    type="radio"
                                    id="format-arrow"
                                    label='Strzałka (→)'
                                    name="shortExitsFormat"
                                    value="arrow"
                                    checked={prefix === '→'}
                                    onChange={() => onChangeSetting(s => s.shortExitsPrefix = '→')}
                                />
                                <Check
                                    type="radio"
                                    id="format-custom"
                                    label="Niestandardowy"
                                    name="shortExitsFormat"
                                    value="custom"
                                    checked={customPrefix}
                                    onChange={() => onChangeSetting(s => s.shortExitsPrefix = '>>>')}
                                />
                            </div>
                            {customPrefix && (
                                <Input
                                    mono
                                    className="settings-narrow"
                                    value={settings.shortExitsPrefix ?? ''}
                                    onChange={e => onChangeSetting(s => s.shortExitsPrefix = e.target.value)}
                                    placeholder="np. >>>"
                                />
                            )}
                        </Field>
                        <Field label="Kolor tekstu" htmlFor="exits-color">
                            <div className="popup-inline">
                                <input
                                    type="color"
                                    id="exits-color"
                                    className="popup-color"
                                    value={settings.shortExitsColor ?? '#ffa500'}
                                    onChange={e => onChangeSetting(s => s.shortExitsColor = e.target.value)}
                                />
                                <UiButton size="sm" variant="ghost" onClick={() => onChangeSetting(s => s.shortExitsColor = '#ffa500')} title="Przywróć domyślny kolor">↺</UiButton>
                            </div>
                        </Field>
                        <Field label="Kolor tła" htmlFor="exits-bg-color">
                            <div className="popup-inline">
                                <input
                                    type="color"
                                    id="exits-bg-color"
                                    className="popup-color"
                                    value={settings.shortExitsBackgroundColor ?? 'transparent'}
                                    onChange={e => onChangeSetting(s => s.shortExitsBackgroundColor = e.target.value)}
                                />
                                <UiButton size="sm" variant="ghost" onClick={() => onChangeSetting(s => s.shortExitsBackgroundColor = 'transparent')} title="Przywróć domyślny kolor tła">↺</UiButton>
                            </div>
                        </Field>
                        <Field label="Separator" htmlFor="separator" hint="Między kierunkami">
                            <Input
                                mono
                                id="separator"
                                className="settings-narrow"
                                value={settings.shortExitsSeparator ?? ' '}
                                onChange={e => onChangeSetting(s => s.shortExitsSeparator = e.target.value)}
                                placeholder=" "
                                maxLength={5}
                            />
                        </Field>
                    </div>
                    <Field label="Podgląd">
                        <div
                            className="settings-exits-preview"
                            style={{
                                backgroundColor: settings.shortExitsBackgroundColor ?? 'transparent',
                                color: settings.shortExitsColor ?? '#ffa500',
                            }}
                        >
                            {prefix + (settings.shortExitsSeparator ?? ' ') + 'N' + (settings.shortExitsSeparator ?? ' ') + 'E' + (settings.shortExitsSeparator ?? ' ') + 'NE'}
                        </div>
                    </Field>
                    <UiButton
                        size="sm"
                        className="ui-settings-self-start"
                        onClick={() => onChangeSetting(s => {
                            s.shortExitsPrefix = '-----:';
                            s.shortExitsSeparator = ' ';
                            s.shortExitsColor = '#ffa500';
                            s.shortExitsBackgroundColor = 'transparent';
                        })}
                        title="Przywróć wszystkie domyślne ustawienia"
                    >
                        Przywróć domyślne
                    </UiButton>
                </div>
            )}
        </section>
    );
}

export function OtherOptionsSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    return (
        <section className="character-settings-section">
            <h5 className="character-settings-section-title">Pozostałe opcje</h5>
            <div className="character-settings-stack">
                <div className="settings-checks">
                    <Check
                        id="packageHelper"
                        label="Asystent paczek"
                        checked={settings.packageHelper}
                        onChange={e => onChangeSetting(s => s.packageHelper = e.target.checked)}
                    />
                    <Check
                        id="packageInContainer"
                        label="Paczka do pojemnika"
                        checked={settings.packageInContainer}
                        onChange={e => onChangeSetting(s => s.packageInContainer = e.target.checked)}
                    />
                    <Check
                        id="fullHpMessage"
                        label={<>Informacja o pelnym zdrowiu <HelpHint text="Gdy wlaczone, wyswietla komunikat gdy zdrowie postaci zostanie w pelni odnowione."/></>}
                        checked={settings.fullHpMessage}
                        onChange={e => onChangeSetting(s => s.fullHpMessage = e.target.checked)}
                    />
                    <Check
                        id="sunTracker"
                        label={<>Ramki wschodu/zachodu <HelpHint text="Wyswietla kolorowe ramki przy wschodach/zachodach slonca. Obserwacje sa rejestrowane zawsze. Uzyj /slonce aby otworzyc kalendarz."/></>}
                        checked={settings.sunTracker}
                        onChange={e => onChangeSetting(s => s.sunTracker = e.target.checked)}
                    />
                    <Check
                        id="carriageTeamTickets"
                        label={<>Bilety dla druzyny przy wjezdzie wozem <HelpHint text="Gdy wjezdzasz wozem na statek, bind wejscia kupuje bilety takze dla czlonkow druzyny na lokacji i wrecza im je (jak /bilety). Wylaczone: kupuje tylko twoj bilet."/></>}
                        checked={settings.carriageTeamTickets}
                        onChange={e => onChangeSetting(s => s.carriageTeamTickets = e.target.checked)}
                    />
                </div>
                <Field label="Szerokosc linii listu" htmlFor="letterLineWidth">
                    <Input
                        type="number"
                        min={LETTER_LINE_WIDTH_MIN}
                        max={LETTER_LINE_WIDTH_MAX}
                        id="letterLineWidth"
                        className="settings-num"
                        value={settings.letterLineWidth}
                        onChange={ev => {
                            const parsed = parseInt(ev.target.value, 10);
                            const fallback = defaultSettings.letterLineWidth;
                            const clamped = Math.min(
                                LETTER_LINE_WIDTH_MAX,
                                Math.max(LETTER_LINE_WIDTH_MIN, Number.isFinite(parsed) ? parsed : fallback)
                            );
                            onChangeSetting(s => s.letterLineWidth = clamped);
                        }}
                    />
                </Field>
                <Field label="Alarm niskiego zdrowia" htmlFor="lowHpAlert">
                    <Select
                        id="lowHpAlert"
                        className="settings-narrow"
                        value={settings.lowHpAlert}
                        onChange={e => onChangeSetting(s => s.lowHpAlert = parseInt(e.target.value) || 0)}
                    >
                        {lowHpAlertOptions.map(option => (
                            <option value={option.value} key={option.value}>{option.label}</option>
                        ))}
                    </Select>
                </Field>
            </div>
        </section>
    );
}

export function ContainersSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    return (
        <section className="character-settings-section">
            <h5 className="character-settings-section-title">Pojemniki</h5>
            <div className="character-settings-stack">
                <div className="settings-checks">
                    <Check
                        id="prettyContainers"
                        label="Formatuj pojemniki"
                        checked={settings.prettyContainers}
                        onChange={e => onChangeSetting(s => s.prettyContainers = e.target.checked)}
                    />
                    <Check
                        id="containerOpen"
                        label="Otwieraj pojemnik"
                        checked={settings.containerOpen}
                        onChange={e => onChangeSetting(s => s.containerOpen = e.target.checked)}
                    />
                    <Check
                        id="containerClose"
                        label="Zamykaj pojemnik"
                        checked={settings.containerClose}
                        onChange={e => onChangeSetting(s => s.containerClose = e.target.checked)}
                    />
                </div>
                <Field label="Kolumny" htmlFor="containerColumns">
                    <Input
                        type="number"
                        min={1}
                        max={4}
                        id="containerColumns"
                        className="settings-num"
                        value={settings.containerColumns}
                        onChange={ev => onChangeSetting(s => s.containerColumns = parseInt(ev.target.value) || 1)}
                    />
                </Field>
            </div>
        </section>
    );
}

export function CollectSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    const [extraInput, setExtraInput] = useState<string>('');
    const [showOverridesModal, setShowOverridesModal] = useState(false);

    const addExtra = () => {
        if (extraInput.trim()) {
            onChangeSetting(s => s.collectExtra = [...s.collectExtra, extraInput.trim()]);
            setExtraInput('');
        }
    };

    return (
        <section className="character-settings-section">
            <h5 className="character-settings-section-title">Zbieranie przedmiotów</h5>
            <div className="character-settings-stack">
                <Field label="Tryb zbierania" htmlFor="collectMode">
                    <Select
                        id="collectMode"
                        className="settings-narrow"
                        value={settings.collectMode}
                        onChange={e => onChangeSetting(s => s.collectMode = parseInt(e.target.value))}
                    >
                        {collectModeOptions.map((label, i) => (
                            <option value={i + 1} key={i + 1}>{`${i + 1} - ${label}`}</option>
                        ))}
                    </Select>
                </Field>
                <Field label="Kiedy zbierac" htmlFor="collectTiming">
                    <Select
                        id="collectTiming"
                        value={settings.collectTiming}
                        onChange={e => onChangeSetting(s => s.collectTiming = parseInt(e.target.value))}
                    >
                        {collectTimingOptions.map((label, i) => (
                            <option value={i + 1} key={i + 1}>{`${i + 1} - ${label}`}</option>
                        ))}
                    </Select>
                </Field>
                <Field label="Co zbierac">
                    <div className="settings-checks">
                        <Check
                            id="collectCopper"
                            label="Miedziane monety"
                            checked={settings.collectCopper}
                            onChange={e => onChangeSetting(s => s.collectCopper = e.target.checked)}
                        />
                        <Check
                            id="collectSilver"
                            label="Srebrne monety"
                            checked={settings.collectSilver}
                            onChange={e => onChangeSetting(s => s.collectSilver = e.target.checked)}
                        />
                        <Check
                            id="collectGold"
                            label="Zlote monety"
                            checked={settings.collectGold}
                            onChange={e => onChangeSetting(s => s.collectGold = e.target.checked)}
                        />
                        <Check
                            id="collectGems"
                            label="Kamienie"
                            checked={settings.collectGems}
                            onChange={e => onChangeSetting(s => s.collectGems = e.target.checked)}
                        />
                    </div>
                </Field>
                <Field label="Dodatkowe przedmioty" htmlFor="extraItem">
                    <div className="popup-inline">
                        <Input
                            id="extraItem"
                            data-settings-ignore
                            className="settings-narrow"
                            value={extraInput}
                            onChange={e => setExtraInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addExtra();
                                }
                            }}
                        />
                        <UiButton size="sm" onClick={addExtra}>Dodaj</UiButton>
                    </div>
                    {settings.collectExtra.length > 0 && (
                        <div className="settings-chip-list">
                            {settings.collectExtra.map(item => (
                                <span
                                    key={item}
                                    className="popup-chip"
                                    onClick={() => onChangeSetting(s => s.collectExtra = s.collectExtra.filter(i => i !== item))}
                                    title="Usuń"
                                >
                                    {item}
                                    <span className="popup-chip__remove">×</span>
                                </span>
                            ))}
                            <UiButton
                                size="sm"
                                variant="ghost"
                                onClick={() => onChangeSetting(s => s.collectExtra = [])}
                            >
                                Wyczyść wszystko
                            </UiButton>
                        </div>
                    )}
                </Field>
                <Field label="Nadpisania dla wrogów">
                    <UiButton
                        size="sm"
                        className="ui-settings-self-start"
                        onClick={() => setShowOverridesModal(true)}
                    >
                        Konfiguruj ({settings.collectOverrides.length})
                    </UiButton>
                </Field>
                <CollectOverridesModal
                    show={showOverridesModal}
                    overrides={settings.collectOverrides}
                    onClose={() => setShowOverridesModal(false)}
                    onSave={(overrides) => onChangeSetting(s => s.collectOverrides = overrides)}
                />
            </div>
        </section>
    );
}

export function CombatCommandsSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    return (
        <section className="character-settings-section">
            <h5 className="character-settings-section-title">Walka</h5>
            <div className="character-settings-stack">
                <Field label="Komenda ataku" hint='Uzywana przy ataku na numery obiektow. Domyslnie "zabij".'>
                    <Input
                        mono
                        className="settings-command"
                        value={settings.attackCommand}
                        placeholder="zabij"
                        onChange={e => onChangeSetting(s => s.attackCommand = e.target.value)}
                    />
                </Field>
                <Field label="Komenda wsparcia" hint='Uzywana przy wspieraniu lidera druzyny. Domyslnie "wesprzyj".'>
                    <Input
                        mono
                        className="settings-command"
                        value={settings.supportCommand}
                        placeholder="wesprzyj"
                        onChange={e => onChangeSetting(s => s.supportCommand = e.target.value)}
                    />
                </Field>
                <Field
                    label="Komenda dobycia broni"
                    hint='Wysylana przy automatycznym dobywaniu wszystkich broni. "wszystkich broni" dodawane automatycznie.'
                >
                    <Input
                        mono
                        className="settings-command"
                        value={settings.drawWeaponCommand}
                        placeholder="dobadz"
                        onChange={e => onChangeSetting(s => s.drawWeaponCommand = e.target.value)}
                    />
                </Field>
            </div>
        </section>
    );
}

export function HerbsSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    return (
        <section className="character-settings-section">
            <h5 className="character-settings-section-title">Zioła</h5>
            <div className="character-settings-stack">
                <Field label="Komendy przed użyciem" hint="Oddziel komendy średnikiem (;)">
                    <Input
                        mono
                        className="settings-command"
                        value={settings.herbPreUseCommand}
                        onChange={e => onChangeSetting(s => s.herbPreUseCommand = e.target.value)}
                    />
                </Field>
                <Field label="Komendy po użyciu" hint="Oddziel komendy średnikiem (;)">
                    <Input
                        mono
                        className="settings-command"
                        value={settings.herbPostUseCommand}
                        onChange={e => onChangeSetting(s => s.herbPostUseCommand = e.target.value)}
                    />
                </Field>
                <Field label='Ilosc "wiele"' htmlFor="herbWieleCount">
                    <Input
                        type="number"
                        min={1}
                        id="herbWieleCount"
                        className="settings-num"
                        value={settings.herbWieleCount}
                        onChange={ev => {
                            const parsed = parseInt(ev.target.value, 10);
                            const value = Number.isFinite(parsed) && parsed > 0 ? parsed : 25;
                            onChangeSetting(s => s.herbWieleCount = value);
                        }}
                    />
                </Field>
            </div>
        </section>
    );
}

export function CuttingSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    return (
        <section className="character-settings-section">
            <h5 className="character-settings-section-title">Wycinanie/Wyrywanie</h5>
            <div className="character-settings-stack">
                <Field label="Komendy przed wycinaniem" hint="Oddziel komendy średnikiem (;)">
                    <Input
                        mono
                        className="settings-command"
                        value={settings.cuttingPreAction}
                        onChange={e => onChangeSetting(s => s.cuttingPreAction = e.target.value)}
                    />
                </Field>
                <Field label="Komendy po wycinaniu" hint="Oddziel komendy średnikiem (;)">
                    <Input
                        mono
                        className="settings-command"
                        value={settings.cuttingPostAction}
                        onChange={e => onChangeSetting(s => s.cuttingPostAction = e.target.value)}
                    />
                </Field>
            </div>
        </section>
    );
}

const DRAW_SHEATHE_SLOTS = [1, 2, 3] as const;
type DrawSheatheKey = `${'dob' | 'op'}Command${1 | 2 | 3}`;

export function DrawSheatheSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    const column = (command: 'dob' | 'op') => (
        <div className="character-settings-stack">
            {DRAW_SHEATHE_SLOTS.map(slot => {
                const key = `${command}Command${slot}` as DrawSheatheKey;
                return (
                    <Field key={key} label={`Komenda /${command} ${slot}`}>
                        <Input
                            mono
                            className="settings-command"
                            value={settings[key]}
                            onChange={e => onChangeSetting(s => s[key] = e.target.value)}
                        />
                    </Field>
                );
            })}
        </div>
    );
    return (
        <section className="character-settings-section">
            <h5 className="character-settings-section-title">Dobywanie/Opuszczanie</h5>
            <div className="character-settings-stack">
                <p className="popup-field__hint">
                    /dob bez argumentu wysyla komendy 1 i 2, /dob [1-3] wysyla wybrany slot. Analogicznie /op.
                    Oddziel komendy srednikiem (;).
                </p>
                <div className="settings-columns">
                    {column('dob')}
                    {column('op')}
                </div>
            </div>
        </section>
    );
}

export function LanguageSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    const [aliasInput, setAliasInput] = useState<string>('');
    const [aliasAdjInput, setAliasAdjInput] = useState<string>('');
    const [aliasLangInput, setAliasLangInput] = useState<string>('potoczna');

    return (
        <section className="character-settings-section character-settings-section--full">
            <h5 className="character-settings-section-title">Język</h5>
            <div className="settings-fields-row">
                <Field label="Przyslowek">
                    <Input
                        className="settings-narrow"
                        value={settings.languageAdjective}
                        onChange={e => onChangeSetting(s => s.languageAdjective = e.target.value)}
                    />
                </Field>
                <Field label="Domyślny język">
                    <Select
                        className="settings-narrow"
                        value={settings.language}
                        onChange={e => onChangeSetting(s => s.language = e.target.value)}
                    >
                        {languageOptions.map(lang => (
                            <option key={lang} value={lang}>{lang}</option>
                        ))}
                    </Select>
                </Field>
            </div>
            <table className="popup-table">
                <thead>
                <tr>
                    <th>Alias</th>
                    <th>Przyslowek</th>
                    <th>Język</th>
                    <th></th>
                </tr>
                </thead>
                <tbody>
                {settings.languageAliases.map(item => (
                    <tr key={item.alias}>
                        <td>{item.alias}</td>
                        <td>{item.adjective}</td>
                        <td>{item.language}</td>
                        <td>
                            <DeleteButton onClick={() => onChangeSetting(s => s.languageAliases = s.languageAliases.filter(a => a !== item))}/>
                        </td>
                    </tr>
                ))}
                <tr data-settings-ignore>
                    <td>
                        <Input
                            mono
                            value={aliasInput}
                            onChange={e => setAliasInput(e.target.value)}
                            placeholder="np. /po"
                        />
                    </td>
                    <td>
                        <Input
                            value={aliasAdjInput}
                            onChange={e => setAliasAdjInput(e.target.value)}
                            placeholder="np. potocznie"
                        />
                    </td>
                    <td>
                        <Select
                            value={aliasLangInput}
                            onChange={e => setAliasLangInput(e.target.value)}
                        >
                            {languageOptions.map(lang => (
                                <option key={lang} value={lang}>{lang}</option>
                            ))}
                        </Select>
                    </td>
                    <td>
                        <UiButton
                            size="sm"
                            onClick={() => {
                                if (aliasInput.trim()) {
                                    onChangeSetting(s => s.languageAliases = [...s.languageAliases, {
                                        alias: aliasInput.trim(),
                                        adjective: aliasAdjInput.trim(),
                                        language: aliasLangInput
                                    }]);
                                    setAliasInput('');
                                    setAliasAdjInput('');
                                }
                            }}
                        >
                            Dodaj
                        </UiButton>
                    </td>
                </tr>
                </tbody>
            </table>
        </section>
    );
}
