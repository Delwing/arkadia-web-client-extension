import "../style.css";
import { useEffect, useState } from "react";
import { Form, Button } from "react-bootstrap";
import storage, { getCurrentCharacter } from "@modules/core/storage";
import { defaultSettings } from "./defaultSettings";
import type { Settings as BaseSettings } from "./defaultSettings";

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

const LEGACY_COIN_MODES = new Set([1, 3, 4, 6]);
const LEGACY_GEM_MODES = new Set([2, 3, 5, 6]);

function translateLegacyCollectMode(value?: number): number {
    if (value === 7) {
        return 4;
    }
    if (typeof value === "number" && value >= 4 && value <= 6) {
        return 3;
    }
    return 1;
}

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
    const isLegacy = typeof saved?.collectMoneyType === "number";

    if (isLegacy) {
        const legacyMode = typeof saved?.collectMode === "number" ? saved.collectMode : undefined;
        merged.collectMode = translateLegacyCollectMode(legacyMode);
        const collectsCoins = legacyMode === undefined ? true : LEGACY_COIN_MODES.has(legacyMode);
        if (!collectsCoins) {
            merged.collectCopper = false;
            merged.collectSilver = false;
            merged.collectGold = false;
        } else {
            const moneyType = saved?.collectMoneyType ?? 1;
            if (moneyType === 3) {
                merged.collectCopper = false;
                merged.collectSilver = false;
                merged.collectGold = true;
            } else if (moneyType === 2) {
                merged.collectCopper = false;
                merged.collectSilver = true;
                merged.collectGold = true;
            } else {
                merged.collectCopper = true;
                merged.collectSilver = true;
                merged.collectGold = true;
            }
        }
        merged.collectGems = legacyMode === undefined ? defaultSettings.collectGems : LEGACY_GEM_MODES.has(legacyMode);
    } else {
        merged.collectMode = normalizeCollectMode(merged.collectMode);
        merged.collectCopper = !!merged.collectCopper;
        merged.collectSilver = !!merged.collectSilver;
        merged.collectGold = !!merged.collectGold;
        merged.collectGems = !!merged.collectGems;
    }

    delete merged.collectMoneyType;

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
    { value: 0, label: '0 - Wylaczony' },
    { value: 1, label: '1 - Ledwo zywy' },
    { value: 2, label: '2 - Ciezko ranny' },
    { value: 3, label: '3 - W zlej kondycji' },
    { value: 4, label: '4 - Ranny' },
    { value: 5, label: '5 - Lekko ranny' },
    { value: 6, label: '6 - W dobrym stanie' },
    { value: 7, label: '7 - W swietnej kondycji' },
];

const LETTER_LINE_WIDTH_MIN = 40;
const LETTER_LINE_WIDTH_MAX = 120;

function SettingsForm({ registerSave }: { registerSave: (cb: () => void) => void }) {
    const [settings, setSettings] = useState<FormSettings>({ ...defaultSettings });

    const [locked, setLocked] = useState(!getCurrentCharacter());

    useEffect(() => {
        const update = () => setLocked(!getCurrentCharacter());
        storage.onChanged?.addListener(update);
        window.addEventListener("storage", update);
        return () => {
            storage.onChanged?.removeListener?.(update);
            window.removeEventListener("storage", update);
        };
    }, []);

    const [extraInput, setExtraInput] = useState<string>('')
    const [aliasInput, setAliasInput] = useState<string>('')
    const [aliasAdjInput, setAliasAdjInput] = useState<string>('')
    const [aliasLangInput, setAliasLangInput] = useState<string>('potoczna')

    function onChangeSetting(modifier: (settings: FormSettings) => void) {
        setSettings(prev => {
            const updated = {...prev}
            modifier(updated)
            return updated
        })
    }
    useEffect(() => {
        registerSave(() => storage.setItem("settings", settings));
    }, [registerSave, settings]);

    useEffect(() => {
        const load = () => {
            storage.getItem("settings").then(res => {
                const merged = normalizeSettingsValue(res?.settings);
                if (typeof merged.lowHpAlert !== 'number') {
                    merged.lowHpAlert = merged.lowHpAlert ? 2 : 0;
                }
                setSettings(merged);
            });
        };

        load();

        const listener = (changes: { [key: string]: { oldValue: any; newValue: any } }) => {
            if (changes.settings) {
                load();
            }
        };

        storage.onChanged?.addListener(listener);
        return () => {
            storage.onChanged?.removeListener?.(listener);
        };
    }, []);

    return (
        <div className="p-2 h-100">
            <fieldset disabled={locked} className="p-0 border-0 m-0">
                <div className="character-settings-layout">
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
                                id="inlineCompassRose"
                                label="Róża wiatrów"
                                checked={settings.inlineCompassRose}
                                onChange={e => onChangeSetting(s => s.inlineCompassRose = e.target.checked)}
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
                            <Form.Check
                                type="checkbox"
                                id="fullHpMessage"
                                label="Informacja o pelnym zdrowiu"
                                checked={settings.fullHpMessage}
                                onChange={e => onChangeSetting(s => s.fullHpMessage = e.target.checked)}
                                className="me-2"
                            />
                            <Form.Group className="d-flex align-items-center me-2">
                                <Form.Label className="me-1 mb-0" htmlFor="letterLineWidth">Szerokosc linii listu:</Form.Label>
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
                                    style={{ width: '100%', maxWidth: '5rem' }}
                                />
                            </Form.Group>
                            <Form.Group className="d-flex align-items-center me-2">
                                <Form.Label className="me-1 mb-0" htmlFor="lowHpAlert">Alarm niskiego zdrowia:</Form.Label>
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
                                    style={{ width: '100%', maxWidth: '4rem' }}
                                />
                            </Form.Group>
                        </div>
                    </section>
                    <section className="character-settings-section">
                        <h5 className="character-settings-section-title">Zbieranie przedmiotów</h5>
                        <div className="character-settings-stack">
                            <Form.Group className="d-flex align-items-center">
                                <Form.Label className="me-1 mb-0">Tryb zbierania:</Form.Label>
                                <Form.Select
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
                                    style={{ width: '100%', maxWidth: '10rem' }}
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
                                    style={{ width: '100%', maxWidth: '20rem' }}
                                />
                                <Form.Text className="text-muted">
                                    Uzywana przy ataku na numery obiektow. Domyslnie "zabij".
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
                                    style={{ width: '100%', maxWidth: '20rem' }}
                                />
                                <Form.Text className="text-muted">
                                    Wysylana przy automatycznym dobywaniu wszystkich broni. "wszystkich broni" dodawane automatycznie.
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
                                    style={{ width: '100%', maxWidth: '20rem' }}
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
                                    style={{ width: '100%', maxWidth: '20rem' }}
                                />
                                <Form.Text className="text-muted">Oddziel komendy średnikiem (;)</Form.Text>
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
                                    style={{ width: '100%', maxWidth: '10rem' }}
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
                                            style={{ width: '100%', maxWidth: '6rem' }}
                                        />
                                    </td>
                                    <td>
                                        <Form.Control
                                            type="text"
                                            size="sm"
                                            value={aliasAdjInput}
                                            onChange={e => setAliasAdjInput(e.target.value)}
                                            style={{ width: '100%', maxWidth: '10rem' }}
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
                                                    onChangeSetting(s => s.languageAliases = [
                                                        ...s.languageAliases,
                                                        {
                                                            alias: aliasInput.trim(),
                                                            adjective: aliasAdjInput.trim(),
                                                            language: aliasLangInput,
                                                        },
                                                    ]);
                                                    setAliasInput('');
                                                    setAliasAdjInput('');
                                                    setAliasLangInput('potoczna');
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
    );
}

export default SettingsForm;
