import '../style.css'
import {useEffect, useState} from "react";
import {Form, Button} from 'react-bootstrap';
import storage, { getCurrentCharacter } from "@client/src/storage";
import { Settings as BaseSettings, defaultSettings } from './defaultSettings';

interface FormSettings extends BaseSettings {
}

const collectModeOptions = [
    "monety",
    "kamienie",
    "monety i kamienie",
    "druzynowe monety",
    "druzynowe kamienie",
    "druzynowe monety i kamienie",
    "nic",
]

const collectMoneyOptions = ["wszystkie", "srebrne", "zlote"]

const languageOptions = [
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
    "potoczna",
    "ghassall",
]

function SettingsForm() {

    const [settings, setSettings] = useState<FormSettings>({ ...defaultSettings })

    const [locked, setLocked] = useState(!getCurrentCharacter())

    useEffect(() => {
        const update = () => setLocked(!getCurrentCharacter());
        storage.onChanged?.addListener(update);
        window.addEventListener('storage', update);
        return () => {
            storage.onChanged?.removeListener?.(update);
            window.removeEventListener('storage', update);
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


    function handleSubmission() {
        storage.setItem("settings", settings);
        window.dispatchEvent(new Event('close-options'));
    }

    useEffect(() => {
        const load = () => {
            storage.getItem("settings").then(res => {
                setSettings(Object.assign({}, defaultSettings, res?.settings));
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

    const char = getCurrentCharacter();

    return (
        <div className="my-4 p-2">
            {locked ? (
                <div className="alert alert-info" role="alert">
                    Opcje zależne od postaci są zablokowane do momentu jej wybrania.
                </div>
            ) : char && (
                <div className="alert alert-info" role="alert">
                    Ustawienia dotyczą postaci: <strong>{char}</strong>
                </div>
            )}
            <fieldset disabled={locked} className="p-0 border-0 m-0">
            <div className="mb-4 border rounded p-3">
                <h5 className="fw-bold mb-2">Język</h5>
                <div className="d-flex flex-wrap gap-3 align-items-center">
                    <Form.Group className="d-flex align-items-center">
                        <Form.Label className="me-1 mb-0">Przymiotnik:</Form.Label>
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
                <div className="mt-3 d-flex flex-wrap gap-2 align-items-center">
                    <Form.Group className="d-flex align-items-center">
                        <Form.Label className="me-1 mb-0">Alias:</Form.Label>
                        <Form.Control
                            type="text"
                            size="sm"
                            value={aliasInput}
                            onChange={e => setAliasInput(e.target.value)}
                            style={{width: '100%', maxWidth: '6rem'}}
                        />
                    </Form.Group>
                    <Form.Group className="d-flex align-items-center">
                        <Form.Label className="me-1 mb-0">Przymiotnik:</Form.Label>
                        <Form.Control
                            type="text"
                            size="sm"
                            value={aliasAdjInput}
                            onChange={e => setAliasAdjInput(e.target.value)}
                            style={{width: '100%', maxWidth: '10rem'}}
                        />
                    </Form.Group>
                    <Form.Group className="d-flex align-items-center">
                        <Form.Label className="me-1 mb-0">Język:</Form.Label>
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
                    </Form.Group>
                    <Button
                        size="sm"
                        onClick={() => {
                            if (aliasInput.trim()) {
                                onChangeSetting(s => s.languageAliases = [...s.languageAliases, { alias: aliasInput.trim(), adjective: aliasAdjInput.trim(), language: aliasLangInput }]);
                                setAliasInput('');
                                setAliasAdjInput('');
                                setAliasLangInput('potoczna');
                            }
                        }}
                    >
                        Dodaj
                    </Button>
                </div>
                {settings.languageAliases.length > 0 && (
                    <ul className="list-unstyled ms-3 mt-2">
                        {settings.languageAliases.map(item => (
                            <li key={item.alias} className="d-flex align-items-center gap-2">
                                <span>{`${item.alias} ${item.adjective} ${item.language}`}</span>
                                <Button size="sm" variant="secondary" onClick={() => onChangeSetting(s => s.languageAliases = s.languageAliases.filter(a => a !== item))}>Usuń</Button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <div className="mb-4 border rounded p-3">
                <h5 className="fw-bold mb-2">Pozostałe opcje</h5>
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
                </div>
            </div>
            <div className="mb-4 border rounded p-3">
                <h5 className="fw-bold mb-2">Pojemniki</h5>
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
                </div>
            </div>
            <div className="mb-4 border rounded p-3">
                <h5 className="fw-bold mb-2">Zbieranie przedmiotów</h5>
                <div className="d-flex flex-column gap-2">
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
                        <Form.Label className="me-1 mb-0">Rodzaj monet:</Form.Label>
                        <Form.Select
                            size="sm"
                            value={settings.collectMoneyType}
                            onChange={e => onChangeSetting(s => s.collectMoneyType = parseInt(e.target.value))}
                            className="w-auto"
                        >
                            {collectMoneyOptions.map((label, i) => (
                                <option value={i + 1} key={i + 1}>{`${i + 1} - ${label}`}</option>
                            ))}
                        </Form.Select>
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
                                <Button size="sm" variant="secondary" onClick={() => onChangeSetting(s => s.collectExtra = s.collectExtra.filter(i => i !== item))}>Usuń</Button>
                            </li>
                        ))}
                    </ul>
                    {settings.collectExtra.length > 0 && (
                        <Button size="sm" variant="secondary" className="mt-1" onClick={() => onChangeSetting(s => s.collectExtra = [])}>Wyczyść wszystko</Button>
                    )}
                </div>
            </div>
            <div className="mb-4 border rounded p-3">
                <h5 className="fw-bold mb-2">Zioła</h5>
                <div className="d-flex flex-column gap-2">
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
                </div>
            </div>
            <Button onClick={handleSubmission}>Zapisz</Button>
            </fieldset>
        </div>
    )
}

export default SettingsForm
