// NOTE: this component does NOT import ../style.css. The stock UI already loads
// that stylesheet globally (main.ts → main-theme.css), so mounting here inside
// stock's modal is fully styled. forge-ui mounts the very same component in its
// own modal but must NOT pull stock's global sheet in — it's a page-wide sheet
// (#content-area, footer, badges, popups, …) that, once loaded, repaints
// forge's whole base UI. forge instead provides the modal chrome via its scoped
// bootstrap-compat.css. Re-adding this import would reintroduce that leak.
import {useState} from "react";
import {Form, Button} from "react-bootstrap";
import {Button as UiButton, Check, Field, Input, Select} from "@web-ui/primitives/index.ts";
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
                        className="settings-narrow"
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
            <div className="d-flex flex-wrap gap-3 align-items-center">
                <Form.Check
                    type="checkbox"
                    id="prettyContainers"
                    label="Formatuj pojemniki"
                    checked={settings.prettyContainers}
                    onChange={e => onChangeSetting(s => s.prettyContainers = e.target.checked)}
                    className="me-2"
                />
                <Form.Group className="d-flex align-items-center me-2">
                    <Form.Label className="me-1 mb-0">Kolumny:</Form.Label>
                    <Form.Control
                        type="number"
                        min={1}
                        max={4}
                        id="containerColumns"
                        value={settings.containerColumns}
                        onChange={ev => onChangeSetting(s => s.containerColumns = parseInt(ev.target.value) || 1)}
                        style={{width: '100%', maxWidth: '4rem'}}
                    />
                </Form.Group>
                <Form.Check
                    type="checkbox"
                    id="containerOpen"
                    label="Otwieraj pojemnik"
                    checked={settings.containerOpen}
                    onChange={e => onChangeSetting(s => s.containerOpen = e.target.checked)}
                    className="me-2"
                />
                <Form.Check
                    type="checkbox"
                    id="containerClose"
                    label="Zamykaj pojemnik"
                    checked={settings.containerClose}
                    onChange={e => onChangeSetting(s => s.containerClose = e.target.checked)}
                    className="me-2"
                />
            </div>
        </section>
    );
}

export function CollectSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    const [extraInput, setExtraInput] = useState<string>('');
    const [showOverridesModal, setShowOverridesModal] = useState(false);

    return (
        <section className="character-settings-section">
            <h5 className="character-settings-section-title">Zbieranie przedmiotów</h5>
            <div className="character-settings-stack">
                <Form.Group className="d-flex align-items-center">
                    <Form.Label className="me-1 mb-0">Tryb zbierania:</Form.Label>
                    <Form.Select
                        id="collectMode"
                        size="sm"
                        value={settings.collectMode}
                        onChange={e => onChangeSetting(s => s.collectMode = parseInt(e.target.value))}
                        className="w-auto"
                    >
                        {collectModeOptions.map((label, i) => (
                            <option value={i + 1} key={i + 1}>{`${i + 1} - ${label}`}</option>
                        ))}
                    </Form.Select>
                </Form.Group>
                <Form.Group className="d-flex align-items-center">
                    <Form.Label className="me-1 mb-0">Kiedy zbierac:</Form.Label>
                    <Form.Select
                        size="sm"
                        value={settings.collectTiming}
                        onChange={e => onChangeSetting(s => s.collectTiming = parseInt(e.target.value))}
                        className="w-auto"
                    >
                        {collectTimingOptions.map((label, i) => (
                            <option value={i + 1} key={i + 1}>{`${i + 1} - ${label}`}</option>
                        ))}
                    </Form.Select>
                </Form.Group>
                <Form.Group>
                    <Form.Label className="me-1 mb-0">Co zbierac:</Form.Label>
                    <div className="d-flex flex-wrap gap-3">
                        <Form.Check
                            type="checkbox"
                            id="collectCopper"
                            label="Miedziane monety"
                            checked={settings.collectCopper}
                            onChange={e => onChangeSetting(s => s.collectCopper = e.target.checked)}
                        />
                        <Form.Check
                            type="checkbox"
                            id="collectSilver"
                            label="Srebrne monety"
                            checked={settings.collectSilver}
                            onChange={e => onChangeSetting(s => s.collectSilver = e.target.checked)}
                        />
                        <Form.Check
                            type="checkbox"
                            id="collectGold"
                            label="Zlote monety"
                            checked={settings.collectGold}
                            onChange={e => onChangeSetting(s => s.collectGold = e.target.checked)}
                        />
                        <Form.Check
                            type="checkbox"
                            id="collectGems"
                            label="Kamienie"
                            checked={settings.collectGems}
                            onChange={e => onChangeSetting(s => s.collectGems = e.target.checked)}
                        />
                    </div>
                </Form.Group>
                <Form.Group>
                    <Form.Label className="me-1">Dodatkowe przedmioty:</Form.Label>
                    <Form.Control
                        id="extraItem"
                        data-settings-ignore
                        type="text"
                        size="sm"
                        value={extraInput}
                        onChange={e => setExtraInput(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                if (extraInput.trim()) {
                                    onChangeSetting(s => s.collectExtra = [...s.collectExtra, extraInput.trim()]);
                                    setExtraInput('');
                                }
                            }
                        }}
                        className="d-inline-block me-1 w-auto"
                        style={{width: '100%', maxWidth: '10rem'}}
                    />
                    <Button
                        size="sm"
                        onClick={() => {
                            if (extraInput.trim()) {
                                onChangeSetting(s => s.collectExtra = [...s.collectExtra, extraInput.trim()]);
                                setExtraInput('');
                            }
                        }}
                    >
                        Dodaj
                    </Button>
                </Form.Group>
                <ul className="list-unstyled ms-3">
                    {settings.collectExtra.map(item => (
                        <li key={item} className="d-flex align-items-center gap-2">
                            <span>{item}</span>
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => onChangeSetting(s => s.collectExtra = s.collectExtra.filter(i => i !== item))}
                            >
                                Usuń
                            </Button>
                        </li>
                    ))}
                </ul>
                {settings.collectExtra.length > 0 && (
                    <Button
                        size="sm"
                        variant="secondary"
                        className="mt-1"
                        onClick={() => onChangeSetting(s => s.collectExtra = [])}
                    >
                        Wyczyść wszystko
                    </Button>
                )}
                <Form.Group className="mt-3 d-flex align-items-center">
                    <Form.Label className="me-1 mb-0">Nadpisania dla wrogów:</Form.Label>
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setShowOverridesModal(true)}
                    >
                        Konfiguruj ({settings.collectOverrides.length})
                    </Button>
                </Form.Group>
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
                <Form.Group>
                    <Form.Label className="me-1 mb-0">Komenda ataku:</Form.Label>
                    <Form.Control
                        type="text"
                        size="sm"
                        value={settings.attackCommand}
                        placeholder="zabij"
                        onChange={e => onChangeSetting(s => s.attackCommand = e.target.value)}
                        style={{width: '100%', maxWidth: '20rem'}}
                    />
                    <Form.Text className="text-muted">
                        Uzywana przy ataku na numery obiektow. Domyslnie "zabij".
                    </Form.Text>
                </Form.Group>
                <Form.Group>
                    <Form.Label className="me-1 mb-0">Komenda wsparcia:</Form.Label>
                    <Form.Control
                        type="text"
                        size="sm"
                        value={settings.supportCommand}
                        placeholder="wesprzyj"
                        onChange={e => onChangeSetting(s => s.supportCommand = e.target.value)}
                        style={{width: '100%', maxWidth: '20rem'}}
                    />
                    <Form.Text className="text-muted">
                        Uzywana przy wspieraniu lidera druzyny. Domyslnie "wesprzyj".
                    </Form.Text>
                </Form.Group>
                <Form.Group>
                    <Form.Label className="me-1 mb-0">Komenda dobycia broni:</Form.Label>
                    <Form.Control
                        type="text"
                        size="sm"
                        value={settings.drawWeaponCommand}
                        placeholder="dobadz"
                        onChange={e => onChangeSetting(s => s.drawWeaponCommand = e.target.value)}
                        style={{width: '100%', maxWidth: '20rem'}}
                    />
                    <Form.Text className="text-muted">
                        Wysylana przy automatycznym dobywaniu wszystkich broni. "wszystkich broni" dodawane
                        automatycznie.
                    </Form.Text>
                </Form.Group>
            </div>
        </section>
    );
}

export function HerbsSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    return (
        <section className="character-settings-section">
            <h5 className="character-settings-section-title">Zioła</h5>
            <div className="character-settings-stack">
                <Form.Group>
                    <Form.Label className="me-1 mb-0">Komendy przed użyciem:</Form.Label>
                    <Form.Control
                        type="text"
                        size="sm"
                        value={settings.herbPreUseCommand}
                        onChange={e => onChangeSetting(s => s.herbPreUseCommand = e.target.value)}
                        style={{width: '100%', maxWidth: '20rem'}}
                    />
                    <Form.Text className="text-muted">Oddziel komendy średnikiem (;)</Form.Text>
                </Form.Group>
                <Form.Group>
                    <Form.Label className="me-1 mb-0">Komendy po użyciu:</Form.Label>
                    <Form.Control
                        type="text"
                        size="sm"
                        value={settings.herbPostUseCommand}
                        onChange={e => onChangeSetting(s => s.herbPostUseCommand = e.target.value)}
                        style={{width: '100%', maxWidth: '20rem'}}
                    />
                    <Form.Text className="text-muted">Oddziel komendy średnikiem (;)</Form.Text>
                </Form.Group>
                <Form.Group className="d-flex align-items-center">
                    <Form.Label className="me-1 mb-0">Ilosc "wiele":</Form.Label>
                    <Form.Control
                        type="number"
                        min={1}
                        id="herbWieleCount"
                        value={settings.herbWieleCount}
                        onChange={ev => {
                            const parsed = parseInt(ev.target.value, 10);
                            const value = Number.isFinite(parsed) && parsed > 0 ? parsed : 25;
                            onChangeSetting(s => s.herbWieleCount = value);
                        }}
                        style={{width: '100%', maxWidth: '5rem'}}
                    />
                </Form.Group>
            </div>
        </section>
    );
}

export function CuttingSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    return (
        <section className="character-settings-section">
            <h5 className="character-settings-section-title">Wycinanie/Wyrywanie</h5>
            <div className="character-settings-stack">
                <Form.Group>
                    <Form.Label className="me-1 mb-0">Komendy przed wycinaniem:</Form.Label>
                    <Form.Control
                        type="text"
                        size="sm"
                        value={settings.cuttingPreAction}
                        onChange={e => onChangeSetting(s => s.cuttingPreAction = e.target.value)}
                        style={{width: '100%', maxWidth: '20rem'}}
                    />
                    <Form.Text className="text-muted">Oddziel komendy średnikiem (;)</Form.Text>
                </Form.Group>
                <Form.Group>
                    <Form.Label className="me-1 mb-0">Komendy po wycinaniu:</Form.Label>
                    <Form.Control
                        type="text"
                        size="sm"
                        value={settings.cuttingPostAction}
                        onChange={e => onChangeSetting(s => s.cuttingPostAction = e.target.value)}
                        style={{width: '100%', maxWidth: '20rem'}}
                    />
                    <Form.Text className="text-muted">Oddziel komendy średnikiem (;)</Form.Text>
                </Form.Group>
            </div>
        </section>
    );
}

export function DrawSheatheSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    return (
        <section className="character-settings-section">
            <h5 className="character-settings-section-title">Dobywanie/Opuszczanie</h5>
            <div className="character-settings-stack">
                <Form.Text className="text-muted mb-2">
                    /dob bez argumentu wysyla komendy 1 i 2, /dob [1-3] wysyla wybrany slot. Analogicznie /op.
                    Oddziel komendy srednikiem (;).
                </Form.Text>
                <Form.Group>
                    <Form.Label className="me-1 mb-0">Komenda /dob 1:</Form.Label>
                    <Form.Control
                        type="text"
                        size="sm"
                        value={settings.dobCommand1}
                        onChange={e => onChangeSetting(s => s.dobCommand1 = e.target.value)}
                        style={{width: '100%', maxWidth: '20rem'}}
                    />
                </Form.Group>
                <Form.Group>
                    <Form.Label className="me-1 mb-0">Komenda /dob 2:</Form.Label>
                    <Form.Control
                        type="text"
                        size="sm"
                        value={settings.dobCommand2}
                        onChange={e => onChangeSetting(s => s.dobCommand2 = e.target.value)}
                        style={{width: '100%', maxWidth: '20rem'}}
                    />
                </Form.Group>
                <Form.Group>
                    <Form.Label className="me-1 mb-0">Komenda /dob 3:</Form.Label>
                    <Form.Control
                        type="text"
                        size="sm"
                        value={settings.dobCommand3}
                        onChange={e => onChangeSetting(s => s.dobCommand3 = e.target.value)}
                        style={{width: '100%', maxWidth: '20rem'}}
                    />
                </Form.Group>
                <Form.Group>
                    <Form.Label className="me-1 mb-0">Komenda /op 1:</Form.Label>
                    <Form.Control
                        type="text"
                        size="sm"
                        value={settings.opCommand1}
                        onChange={e => onChangeSetting(s => s.opCommand1 = e.target.value)}
                        style={{width: '100%', maxWidth: '20rem'}}
                    />
                </Form.Group>
                <Form.Group>
                    <Form.Label className="me-1 mb-0">Komenda /op 2:</Form.Label>
                    <Form.Control
                        type="text"
                        size="sm"
                        value={settings.opCommand2}
                        onChange={e => onChangeSetting(s => s.opCommand2 = e.target.value)}
                        style={{width: '100%', maxWidth: '20rem'}}
                    />
                </Form.Group>
                <Form.Group>
                    <Form.Label className="me-1 mb-0">Komenda /op 3:</Form.Label>
                    <Form.Control
                        type="text"
                        size="sm"
                        value={settings.opCommand3}
                        onChange={e => onChangeSetting(s => s.opCommand3 = e.target.value)}
                        style={{width: '100%', maxWidth: '20rem'}}
                    />
                </Form.Group>
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
                            <UiButton
                                size="sm"
                                variant="danger"
                                onClick={() => onChangeSetting(s => s.languageAliases = s.languageAliases.filter(a => a !== item))}
                            >
                                Usuń
                            </UiButton>
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
