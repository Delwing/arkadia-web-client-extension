import "../style.css";
import {useEffect, useState} from "react";
import {Form, Button} from "react-bootstrap";
import {CircleHelp} from "lucide-react";
import {characterStorage} from "@modules/core/storage";
import {defaultSettings} from "./defaultSettings";
import type {Settings as BaseSettings} from "./defaultSettings";
import {CollectOverridesModal} from "./CollectOverridesModal";

interface FormSettings extends BaseSettings {
}

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

function normalizeCollectMode(value: any): number {
    const parsed = Number(value);
    const numeric = Number.isFinite(parsed) ? Math.round(parsed) : defaultSettings.collectMode;
    if (numeric < 1 || numeric > 4) {
        return 1;
    }
    return numeric;
}

function normalizeSettingsValue(saved: any): FormSettings {
    const merged: any = Object.assign({}, defaultSettings, saved ?? {});

    merged.collectMode = normalizeCollectMode(merged.collectMode);
    merged.collectCopper = !!merged.collectCopper;
    merged.collectSilver = !!merged.collectSilver;
    merged.collectGold = !!merged.collectGold;
    merged.collectGems = !!merged.collectGems;

    if (!Array.isArray(merged.collectOverrides)) {
        merged.collectOverrides = defaultSettings.collectOverrides;
    }

    return merged as FormSettings;
}

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

function SettingsForm({registerSave}: { registerSave: (cb: (sharedSettings: Settings) => void) => void }) {
    const [settings, setSettings] = useState<FormSettings>({...defaultSettings});

    const [locked, setLocked] = useState(!characterStorage.getCharacter());

    useEffect(() => {
        const update = () => setLocked(!characterStorage.getCharacter());
        return characterStorage.onCharacterChange(update);
    }, []);

    const [extraInput, setExtraInput] = useState<string>('')
    const [aliasInput, setAliasInput] = useState<string>('')
    const [aliasAdjInput, setAliasAdjInput] = useState<string>('')
    const [aliasLangInput, setAliasLangInput] = useState<string>('potoczna')
    const [showOverridesModal, setShowOverridesModal] = useState(false)

    function onChangeSetting(modifier: (settings: FormSettings) => void) {
        setSettings(prev => {
            const updated = {...prev}
            modifier(updated)
            return updated
        })
    }

    useEffect(() => {
        registerSave((sharedSettings: Settings) => {
            // Update the shared settings object with our values
            Object.assign(sharedSettings, settings);
        });
    }, [registerSave, settings]);

    useEffect(() => {
        const load = () => {
            const saved = characterStorage.get("settings");
            const merged = normalizeSettingsValue(saved);
            if (typeof merged.lowHpAlert !== 'number') {
                merged.lowHpAlert = merged.lowHpAlert ? 2 : 0;
            }
            setSettings(merged);
        };

        load();

        const unsub = characterStorage.onChange('settings', () => {
            load();
        });
        return () => {
            unsub();
        };
    }, []);

    return (
        <div className="p-2 h-100">
            <fieldset disabled={locked} className="p-0 border-0 m-0">
                <div className="character-settings-layout">
                    <section className="character-settings-section">
                        <h5 className="character-settings-section-title">Wyjścia</h5>
                        <div className="d-flex flex-wrap gap-3 align-items-center">
                            <Form.Group className="d-flex align-items-center me-2">
                                <Form.Label className="me-1 mb-0" htmlFor="inlineCompassRose">Roza wiatrow:</Form.Label>
                                <Form.Select
                                    id="inlineCompassRose"
                                    size="sm"
                                    style={{width: 'auto'}}
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
                                </Form.Select>
                            </Form.Group>
                            <Form.Check
                                type="checkbox"
                                id="compassBackExits"
                                label="Powrót na czerwono"
                                checked={settings.compassBackExits}
                                onChange={e => onChangeSetting(s => s.compassBackExits = e.target.checked)}
                                className="me-2"
                            />
                            <Form.Check
                                type="checkbox"
                                id="shortenExits"
                                label="Skrócone wyjścia"
                                checked={settings.shortenExits}
                                onChange={e => onChangeSetting(s => s.shortenExits = e.target.checked)}
                                className="me-2"
                            />
                        </div>
                        {settings.shortenExits && (
                            <div className="mt-3 pt-3 border-top">
                                <div className="d-flex flex-column gap-3">
                                    <div className="d-flex gap-3">
                                        <button
                                            type="button"
                                            className="btn btn-outline-secondary"
                                            onClick={() => onChangeSetting(s => {
                                                s.shortExitsPrefix = '-----:';
                                                s.shortExitsSeparator = ' ';
                                                s.shortExitsColor = '#ffa500';
                                                s.shortExitsBackgroundColor = 'transparent';
                                            })}
                                            title="Przywróć wszystkie domyślne ustawienia"
                                            style={{ padding: "0.25rem 0.5rem", height: "36px" }}
                                        >
                                            Przywróć domyślne
                                        </button>
                                    </div>
                                    <div className="d-flex gap-3 align-items-flex-start flex-wrap">
                                        <Form.Group className="d-flex flex-column gap-2">
                                            <Form.Label className="mb-0">Przedrostek</Form.Label>
                                            <div className="d-flex flex-column gap-2">
                                                <Form.Check
                                                    type="radio"
                                                    id="format-compact"
                                                    label='Kompaktowy (-----:)'
                                                    name="shortExitsFormat"
                                                    value="compact"
                                                    checked={(settings.shortExitsPrefix ?? '-----:') === '-----:'}
                                                    onChange={() => onChangeSetting(s => s.shortExitsPrefix = '-----:')}
                                                />
                                                <Form.Check
                                                    type="radio"
                                                    id="format-arrow"
                                                    label='Strzałka (→)'
                                                    name="shortExitsFormat"
                                                    value="arrow"
                                                    checked={(settings.shortExitsPrefix ?? '-----:') === '→'}
                                                    onChange={() => onChangeSetting(s => s.shortExitsPrefix = '→')}
                                                />
                                                <Form.Check
                                                    type="radio"
                                                    id="format-custom"
                                                    label="Niestandardowy"
                                                    name="shortExitsFormat"
                                                    value="custom"
                                                    checked={(settings.shortExitsPrefix ?? '-----:') !== '-----:' && (settings.shortExitsPrefix ?? '-----:') !== '→'}
                                                    onChange={() => onChangeSetting(s => s.shortExitsPrefix = '>>>')}
                                                />
                                            </div>
                                            {(settings.shortExitsPrefix ?? '-----:') !== '-----:' && (settings.shortExitsPrefix ?? '-----:') !== '→' && (
                                                <Form.Control
                                                    type="text"
                                                    size="sm"
                                                    value={settings.shortExitsPrefix ?? ''}
                                                    onChange={e => onChangeSetting(s => s.shortExitsPrefix = e.target.value)}
                                                    placeholder="np. >>>"
                                                    style={{maxWidth: '8rem'}}
                                                />
                                            )}
                                        </Form.Group>
                                        <Form.Group className="d-flex flex-column gap-2">
                                            <Form.Label htmlFor="exits-color" className="mb-0">Kolor tekstu</Form.Label>
                                            <div className="d-flex gap-2 align-items-center">
                                                <Form.Control
                                                    type="color"
                                                    id="exits-color"
                                                    value={settings.shortExitsColor ?? '#ffa500'}
                                                    onChange={e => onChangeSetting(s => s.shortExitsColor = e.target.value)}
                                                    className="form-control-color"
                                                    style={{ width: '3rem', height: '2rem' }}
                                                />
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-secondary btn-sm"
                                                    onClick={() => onChangeSetting(s => s.shortExitsColor = '#ffa500')}
                                                    title="Przywróć domyślny kolor"
                                                    style={{ padding: "0.25rem 0.5rem" }}
                                                >
                                                    ↺
                                                </button>
                                            </div>
                                        </Form.Group>
                                        <Form.Group className="d-flex flex-column gap-2">
                                            <Form.Label htmlFor="exits-bg-color" className="mb-0">Kolor tła</Form.Label>
                                            <div className="d-flex gap-2 align-items-center">
                                                <Form.Control
                                                    type="color"
                                                    id="exits-bg-color"
                                                    value={settings.shortExitsBackgroundColor ?? 'transparent'}
                                                    onChange={e => onChangeSetting(s => s.shortExitsBackgroundColor = e.target.value)}
                                                    className="form-control-color"
                                                    style={{ width: '3rem', height: '2rem' }}
                                                />
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-secondary btn-sm"
                                                    onClick={() => onChangeSetting(s => s.shortExitsBackgroundColor = 'transparent')}
                                                    title="Przywróć domyślny kolor tła"
                                                    style={{ padding: "0.25rem 0.5rem" }}
                                                >
                                                    ↺
                                                </button>
                                            </div>
                                        </Form.Group>
                                    </div>
                                    <div className="d-flex gap-3 align-items-flex-end flex-wrap">
                                        <Form.Group className="d-flex flex-column gap-2">
                                            <Form.Label htmlFor="separator" className="mb-0">Separator</Form.Label>
                                            <Form.Control
                                                type="text"
                                                id="separator"
                                                size="sm"
                                                value={settings.shortExitsSeparator ?? ' '}
                                                onChange={e => onChangeSetting(s => s.shortExitsSeparator = e.target.value)}
                                                placeholder=" "
                                                maxLength={5}
                                                style={{maxWidth: '6rem'}}
                                            />
                                            <small className="text-muted d-block" style={{fontSize: '0.75rem'}}>Między kierunkami</small>
                                        </Form.Group>
                                    </div>
                                    <Form.Group className="d-flex flex-column gap-2">
                                        <Form.Label className="mb-0">Podgląd</Form.Label>
                                        <div
                                            style={{
                                                padding: '0.5rem',
                                                backgroundColor: settings.shortExitsBackgroundColor ?? 'transparent',
                                                color: settings.shortExitsColor ?? '#ffa500',
                                                fontFamily: 'monospace',
                                                borderRadius: '0.25rem',
                                                border: '1px solid #333',
                                                whiteSpace: 'nowrap',
                                                fontSize: '0.9rem',
                                                maxWidth: '20rem'
                                            }}
                                        >
                                            {(settings.shortExitsPrefix ?? '-----:') + (settings.shortExitsSeparator ?? ' ') + 'N' + (settings.shortExitsSeparator ?? ' ') + 'E' + (settings.shortExitsSeparator ?? ' ') + 'NE'}
                                        </div>
                                    </Form.Group>
                                </div>
                            </div>
                        )}
                    </section>
                    <section className="character-settings-section">
                        <h5 className="character-settings-section-title">Pozostałe opcje</h5>
                        <div className="d-flex flex-wrap gap-3 align-items-center">
                            <Form.Check
                                type="checkbox"
                                id="packageHelper"
                                label="Asystent paczek"
                                checked={settings.packageHelper}
                                onChange={e => onChangeSetting(s => s.packageHelper = e.target.checked)}
                                className="me-2"
                            />
                            <Form.Check
                                type="checkbox"
                                id="packageInContainer"
                                label="Paczka do pojemnika"
                                checked={settings.packageInContainer}
                                onChange={e => onChangeSetting(s => s.packageInContainer = e.target.checked)}
                                className="me-2"
                            />
                            <Form.Check
                                type="checkbox"
                                id="fullHpMessage"
                                label={<>Informacja o pelnym zdrowiu <span title="Gdy wlaczone, wyswietla komunikat gdy zdrowie postaci zostanie w pelni odnowione." style={{cursor: 'help', opacity: 0.7, verticalAlign: 'middle'}}><CircleHelp size={14} /></span></>}
                                checked={settings.fullHpMessage}
                                onChange={e => onChangeSetting(s => s.fullHpMessage = e.target.checked)}
                                className="me-2"
                            />
                            <Form.Check
                                type="checkbox"
                                id="sunTracker"
                                label={<>Ramki wschodu/zachodu <span title="Wyswietla kolorowe ramki przy wschodach/zachodach slonca. Obserwacje sa rejestrowane zawsze. Uzyj /slonce aby otworzyc kalendarz." style={{cursor: 'help', opacity: 0.7, verticalAlign: 'middle'}}><CircleHelp size={14} /></span></>}
                                checked={settings.sunTracker}
                                onChange={e => onChangeSetting(s => s.sunTracker = e.target.checked)}
                                className="me-2"
                            />
                            <Form.Group className="d-flex align-items-center me-2">
                                <Form.Label className="me-1 mb-0" htmlFor="letterLineWidth">Szerokosc linii
                                    listu:</Form.Label>
                                <Form.Control
                                    type="number"
                                    min={LETTER_LINE_WIDTH_MIN}
                                    max={LETTER_LINE_WIDTH_MAX}
                                    id="letterLineWidth"
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
                                    style={{width: '100%', maxWidth: '5rem'}}
                                />
                            </Form.Group>
                            <Form.Group className="d-flex align-items-center me-2">
                                <Form.Label className="me-1 mb-0" htmlFor="lowHpAlert">Alarm niskiego
                                    zdrowia:</Form.Label>
                                <Form.Select
                                    size="sm"
                                    id="lowHpAlert"
                                    value={settings.lowHpAlert}
                                    onChange={e => onChangeSetting(s => s.lowHpAlert = parseInt(e.target.value) || 0)}
                                    className="w-auto"
                                >
                                    {lowHpAlertOptions.map(option => (
                                        <option value={option.value} key={option.value}>{option.label}</option>
                                    ))}
                                </Form.Select>
                            </Form.Group>
                        </div>
                    </section>
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
                    <section className="character-settings-section character-settings-section--full">
                        <h5 className="character-settings-section-title">Język</h5>
                        <div className="d-flex flex-wrap gap-3 align-items-center">
                            <Form.Group className="d-flex align-items-center">
                                <Form.Label className="me-1 mb-0">Przyslowek:</Form.Label>
                                <Form.Control
                                    type="text"
                                    size="sm"
                                    value={settings.languageAdjective}
                                    onChange={e => onChangeSetting(s => s.languageAdjective = e.target.value)}
                                    style={{width: '100%', maxWidth: '10rem'}}
                                />
                            </Form.Group>
                            <Form.Group className="d-flex align-items-center">
                                <Form.Label className="me-1 mb-0">Domyślny język:</Form.Label>
                                <Form.Select
                                    size="sm"
                                    value={settings.language}
                                    onChange={e => onChangeSetting(s => s.language = e.target.value)}
                                    className="w-auto"
                                >
                                    {languageOptions.map(lang => (
                                        <option key={lang} value={lang}>{lang}</option>
                                    ))}
                                </Form.Select>
                            </Form.Group>
                        </div>
                        <table className="table table-modern table-sm table-hover table-zebra mt-3 mb-0">
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
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => onChangeSetting(s => s.languageAliases = s.languageAliases.filter(a => a !== item))}
                                        >
                                            Usuń
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            <tr>
                                <td>
                                    <Form.Control
                                        type="text"
                                        size="sm"
                                        value={aliasInput}
                                        onChange={e => setAliasInput(e.target.value)}
                                        placeholder="np. /po"
                                        style={{width: '100%', maxWidth: '10rem'}}
                                    />
                                </td>
                                <td>
                                    <Form.Control
                                        type="text"
                                        size="sm"
                                        value={aliasAdjInput}
                                        onChange={e => setAliasAdjInput(e.target.value)}
                                        placeholder="np. potocznie"
                                        style={{width: '100%', maxWidth: '10rem'}}
                                    />
                                </td>
                                <td>
                                    <Form.Select
                                        size="sm"
                                        value={aliasLangInput}
                                        onChange={e => setAliasLangInput(e.target.value)}
                                        className="w-auto"
                                    >
                                        {languageOptions.map(lang => (
                                            <option key={lang} value={lang}>{lang}</option>
                                        ))}
                                    </Form.Select>
                                </td>
                                <td>
                                    <Button
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
                                    </Button>
                                </td>
                            </tr>
                            </tbody>
                        </table>
                    </section>
                </div>
            </fieldset>
        </div>
    )
}

interface Settings extends BaseSettings {
}

export default function SettingsPane({registerSave}: {
    registerSave: (cb: (sharedSettings: Settings) => void) => void
}) {
    return <SettingsForm registerSave={registerSave}/>;
}
