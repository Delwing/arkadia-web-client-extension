// NOTE: this component does NOT import ../style.css. The stock UI already loads
// that stylesheet globally (main.ts → main-theme.css), so mounting here inside
// stock's modal is fully styled. forge-ui mounts the very same component in its
// own modal but must NOT pull stock's global sheet in — it's a page-wide sheet
// (#content-area, footer, badges, popups, …) that, once loaded, repaints
// forge's whole base UI. forge instead provides the modal chrome via its scoped
// bootstrap-compat.css. Re-adding this import would reintroduce that leak.
//
// The nine sections below are spread over three pages of the settings dialog —
// Postać > Ogólne, Przedmioty and Walka — and all three moved onto the design
// system together, because they share one file and a page migrates whole
// (UI_MIGRATION.md §4, §5).
import {useState} from "react";
import {Button, Table, TableCell, TableHeadCell, TableRow} from "@design";
import {CircleHelp} from "lucide-react";
import {
    CheckboxField,
    ColorField,
    NumberField,
    SegmentedField,
    SelectField,
    SettingsCard,
    SettingsHint,
    SettingsRow,
    TextField,
} from "@web/settings/controls.tsx";
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

const SHORT_EXITS_PREFIX_DEFAULT = '-----:';
const SHORT_EXITS_PREFIX_ARROW = '→';
const SHORT_EXITS_COLOR_DEFAULT = '#ffa500';
const SHORT_EXITS_BG_DEFAULT = 'transparent';

type ShortExitsFormat = 'compact' | 'arrow' | 'custom';

function shortExitsFormat(prefix: string | undefined): ShortExitsFormat {
    const value = prefix ?? SHORT_EXITS_PREFIX_DEFAULT;
    if (value === SHORT_EXITS_PREFIX_DEFAULT) return 'compact';
    if (value === SHORT_EXITS_PREFIX_ARROW) return 'arrow';
    return 'custom';
}

/** A hint icon that explains a setting whose label cannot carry the whole story. */
function Help({text}: {text: string}) {
    return (
        <span className="settings-help" title={text}><CircleHelp size={14}/></span>
    );
}

export function ExitsSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    const format = shortExitsFormat(settings.shortExitsPrefix);
    const prefix = settings.shortExitsPrefix ?? SHORT_EXITS_PREFIX_DEFAULT;
    const separator = settings.shortExitsSeparator ?? ' ';
    const color = settings.shortExitsColor ?? SHORT_EXITS_COLOR_DEFAULT;
    const background = settings.shortExitsBackgroundColor ?? SHORT_EXITS_BG_DEFAULT;

    return (
        <SettingsCard title="Wyjścia">
            <SelectField
                id="inlineCompassRose"
                label="Roza wiatrow"
                value={String(settings.inlineCompassRose)}
                onChange={v => onChangeSetting(s => s.inlineCompassRose = Number(v))}
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
            </SelectField>
            <CheckboxField
                id="compassBackExits"
                label="Powrót na czerwono"
                checked={settings.compassBackExits}
                onChange={v => onChangeSetting(s => s.compassBackExits = v)}
            />
            <CheckboxField
                id="shortenExits"
                label="Skrócone wyjścia"
                checked={settings.shortenExits}
                onChange={v => onChangeSetting(s => s.shortenExits = v)}
            />
            {settings.shortenExits && (
                <div className="settings-subsection">
                    <SegmentedField
                        label="Przedrostek"
                        value={format}
                        options={[
                            {value: 'compact', label: 'Kompaktowy', title: SHORT_EXITS_PREFIX_DEFAULT},
                            {value: 'arrow', label: 'Strzałka', title: SHORT_EXITS_PREFIX_ARROW},
                            {value: 'custom', label: 'Niestandardowy'},
                        ]}
                        onChange={next => onChangeSetting(s => {
                            if (next === 'compact') s.shortExitsPrefix = SHORT_EXITS_PREFIX_DEFAULT;
                            else if (next === 'arrow') s.shortExitsPrefix = SHORT_EXITS_PREFIX_ARROW;
                            else s.shortExitsPrefix = '>>>';
                        })}
                    />
                    {format === 'custom' && (
                        <TextField
                            id="shortExitsPrefix"
                            label="Własny przedrostek"
                            value={prefix}
                            placeholder="np. >>>"
                            onChange={v => onChangeSetting(s => s.shortExitsPrefix = v)}
                        />
                    )}
                    <TextField
                        id="separator"
                        label="Separator"
                        value={separator}
                        placeholder=" "
                        hint="Między kierunkami"
                        onChange={v => onChangeSetting(s => s.shortExitsSeparator = v)}
                    />
                    <ColorField
                        id="exits-color"
                        label="Kolor tekstu"
                        value={color}
                        onChange={v => onChangeSetting(s => s.shortExitsColor = v)}
                        onReset={() => onChangeSetting(s => s.shortExitsColor = SHORT_EXITS_COLOR_DEFAULT)}
                    />
                    <ColorField
                        id="exits-bg-color"
                        label="Kolor tła"
                        value={background}
                        onChange={v => onChangeSetting(s => s.shortExitsBackgroundColor = v)}
                        onReset={() => onChangeSetting(s => s.shortExitsBackgroundColor = SHORT_EXITS_BG_DEFAULT)}
                    />
                    <SettingsRow label="Podgląd">
                        {/* The two colours are the player's own setting, not theme
                            roles, so they stay inline. */}
                        <span
                            className="settings-exits-preview"
                            style={{backgroundColor: background, color}}
                        >
                            {prefix + separator + 'N' + separator + 'E' + separator + 'NE'}
                        </span>
                    </SettingsRow>
                    <div className="settings-button-row">
                        <Button
                            variant="outline"
                            size="sm"
                            title="Przywróć wszystkie domyślne ustawienia"
                            onClick={() => onChangeSetting(s => {
                                s.shortExitsPrefix = SHORT_EXITS_PREFIX_DEFAULT;
                                s.shortExitsSeparator = ' ';
                                s.shortExitsColor = SHORT_EXITS_COLOR_DEFAULT;
                                s.shortExitsBackgroundColor = SHORT_EXITS_BG_DEFAULT;
                            })}
                        >
                            Przywróć domyślne
                        </Button>
                    </div>
                </div>
            )}
        </SettingsCard>
    );
}

export function OtherOptionsSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    return (
        <SettingsCard title="Pozostałe opcje">
            <CheckboxField
                id="packageHelper"
                label="Asystent paczek"
                checked={settings.packageHelper}
                onChange={v => onChangeSetting(s => s.packageHelper = v)}
            />
            <CheckboxField
                id="packageInContainer"
                label="Paczka do pojemnika"
                checked={settings.packageInContainer}
                onChange={v => onChangeSetting(s => s.packageInContainer = v)}
            />
            <CheckboxField
                id="fullHpMessage"
                label="Informacja o pelnym zdrowiu"
                labelExtra={<Help text="Gdy wlaczone, wyswietla komunikat gdy zdrowie postaci zostanie w pelni odnowione."/>}
                checked={settings.fullHpMessage}
                onChange={v => onChangeSetting(s => s.fullHpMessage = v)}
            />
            <CheckboxField
                id="sunTracker"
                label="Ramki wschodu/zachodu"
                labelExtra={<Help text="Wyswietla kolorowe ramki przy wschodach/zachodach slonca. Obserwacje sa rejestrowane zawsze. Uzyj /slonce aby otworzyc kalendarz."/>}
                checked={settings.sunTracker}
                onChange={v => onChangeSetting(s => s.sunTracker = v)}
            />
            <CheckboxField
                id="carriageTeamTickets"
                label="Bilety dla druzyny przy wjezdzie wozem"
                labelExtra={<Help text="Gdy wjezdzasz wozem na statek, bind wejscia kupuje bilety takze dla czlonkow druzyny na lokacji i wrecza im je (jak /bilety). Wylaczone: kupuje tylko twoj bilet."/>}
                checked={settings.carriageTeamTickets}
                onChange={v => onChangeSetting(s => s.carriageTeamTickets = v)}
            />
            <NumberField
                id="letterLineWidth"
                label="Szerokosc linii listu"
                value={settings.letterLineWidth}
                min={LETTER_LINE_WIDTH_MIN}
                max={LETTER_LINE_WIDTH_MAX}
                onChange={n => {
                    const clamped = Math.min(
                        LETTER_LINE_WIDTH_MAX,
                        Math.max(LETTER_LINE_WIDTH_MIN, Number.isFinite(n) ? n : defaultSettings.letterLineWidth),
                    );
                    onChangeSetting(s => s.letterLineWidth = clamped);
                }}
            />
            <SelectField
                id="lowHpAlert"
                label="Alarm niskiego zdrowia"
                value={String(settings.lowHpAlert)}
                onChange={v => onChangeSetting(s => s.lowHpAlert = parseInt(v) || 0)}
            >
                {lowHpAlertOptions.map(option => (
                    <option value={option.value} key={option.value}>{option.label}</option>
                ))}
            </SelectField>
        </SettingsCard>
    );
}

export function ContainersSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    return (
        <SettingsCard title="Pojemniki">
            <CheckboxField
                id="prettyContainers"
                label="Formatuj pojemniki"
                checked={settings.prettyContainers}
                onChange={v => onChangeSetting(s => s.prettyContainers = v)}
            />
            <NumberField
                id="containerColumns"
                label="Kolumny"
                value={settings.containerColumns}
                min={1}
                max={4}
                onChange={n => onChangeSetting(s => s.containerColumns = n || 1)}
            />
            <CheckboxField
                id="containerOpen"
                label="Otwieraj pojemnik"
                checked={settings.containerOpen}
                onChange={v => onChangeSetting(s => s.containerOpen = v)}
            />
            <CheckboxField
                id="containerClose"
                label="Zamykaj pojemnik"
                checked={settings.containerClose}
                onChange={v => onChangeSetting(s => s.containerClose = v)}
            />
        </SettingsCard>
    );
}

export function CollectSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    const [extraInput, setExtraInput] = useState<string>('');
    const [showOverridesModal, setShowOverridesModal] = useState(false);

    const addExtra = () => {
        const value = extraInput.trim();
        if (!value) return;
        onChangeSetting(s => s.collectExtra = [...s.collectExtra, value]);
        setExtraInput('');
    };

    return (
        <SettingsCard title="Zbieranie przedmiotów">
            <SelectField
                id="collectMode"
                label="Tryb zbierania"
                value={String(settings.collectMode)}
                onChange={v => onChangeSetting(s => s.collectMode = parseInt(v))}
            >
                {collectModeOptions.map((label, i) => (
                    <option value={i + 1} key={i + 1}>{`${i + 1} - ${label}`}</option>
                ))}
            </SelectField>
            <SelectField
                id="collectTiming"
                label="Kiedy zbierac"
                value={String(settings.collectTiming)}
                onChange={v => onChangeSetting(s => s.collectTiming = parseInt(v))}
            >
                {collectTimingOptions.map((label, i) => (
                    <option value={i + 1} key={i + 1}>{`${i + 1} - ${label}`}</option>
                ))}
            </SelectField>

            <div className="settings-field">
                <span className="settings-field__label">Co zbierac</span>
                <CheckboxField
                    id="collectCopper"
                    label="Miedziane monety"
                    checked={settings.collectCopper}
                    onChange={v => onChangeSetting(s => s.collectCopper = v)}
                />
                <CheckboxField
                    id="collectSilver"
                    label="Srebrne monety"
                    checked={settings.collectSilver}
                    onChange={v => onChangeSetting(s => s.collectSilver = v)}
                />
                <CheckboxField
                    id="collectGold"
                    label="Zlote monety"
                    checked={settings.collectGold}
                    onChange={v => onChangeSetting(s => s.collectGold = v)}
                />
                <CheckboxField
                    id="collectGems"
                    label="Kamienie"
                    checked={settings.collectGems}
                    onChange={v => onChangeSetting(s => s.collectGems = v)}
                />
            </div>

            <div className="settings-field">
                <label className="settings-field__label" htmlFor="extraItem">Dodatkowe przedmioty</label>
                {settings.collectExtra.length > 0 && (
                    <div className="settings-chips">
                        {settings.collectExtra.map(item => (
                            <span
                                key={item}
                                className="settings-chip settings-chip--button"
                                title="Kliknij, aby usunąć"
                                onClick={() => onChangeSetting(s => s.collectExtra = s.collectExtra.filter(i => i !== item))}
                            >
                                {item}
                                <span className="settings-chip__remove">{'×'}</span>
                            </span>
                        ))}
                    </div>
                )}
                {/* The add field is scratch, not a setting: it must not count
                    towards the page's unsaved-changes signature. */}
                <div className="settings-button-row" data-settings-ignore>
                    <TextField
                        id="extraItem"
                        value={extraInput}
                        onChange={setExtraInput}
                    />
                    <Button size="sm" onClick={addExtra}>Dodaj</Button>
                    {settings.collectExtra.length > 0 && (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onChangeSetting(s => s.collectExtra = [])}
                        >
                            Wyczyść wszystko
                        </Button>
                    )}
                </div>
            </div>

            <SettingsRow label="Nadpisania dla wrogów">
                <Button size="sm" onClick={() => setShowOverridesModal(true)}>
                    Konfiguruj ({settings.collectOverrides.length})
                </Button>
            </SettingsRow>
            <CollectOverridesModal
                show={showOverridesModal}
                overrides={settings.collectOverrides}
                onClose={() => setShowOverridesModal(false)}
                onSave={(overrides) => onChangeSetting(s => s.collectOverrides = overrides)}
            />
        </SettingsCard>
    );
}

export function CombatCommandsSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    return (
        <SettingsCard title="Walka">
            <TextField
                id="attackCommand"
                label="Komenda ataku:"
                value={settings.attackCommand}
                placeholder="zabij"
                hint={'Uzywana przy ataku na numery obiektow. Domyslnie "zabij".'}
                onChange={v => onChangeSetting(s => s.attackCommand = v)}
            />
            <TextField
                id="supportCommand"
                label="Komenda wsparcia:"
                value={settings.supportCommand}
                placeholder="wesprzyj"
                hint={'Uzywana przy wspieraniu lidera druzyny. Domyslnie "wesprzyj".'}
                onChange={v => onChangeSetting(s => s.supportCommand = v)}
            />
            <TextField
                id="drawWeaponCommand"
                label="Komenda dobycia broni:"
                value={settings.drawWeaponCommand}
                placeholder="dobadz"
                hint='Wysylana przy automatycznym dobywaniu wszystkich broni. "wszystkich broni" dodawane automatycznie.'
                onChange={v => onChangeSetting(s => s.drawWeaponCommand = v)}
            />
        </SettingsCard>
    );
}

export function HerbsSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    return (
        <SettingsCard title="Zioła">
            <TextField
                id="herbPreUseCommand"
                label="Komendy przed użyciem:"
                value={settings.herbPreUseCommand}
                hint="Oddziel komendy średnikiem (;)"
                onChange={v => onChangeSetting(s => s.herbPreUseCommand = v)}
            />
            <TextField
                id="herbPostUseCommand"
                label="Komendy po użyciu:"
                value={settings.herbPostUseCommand}
                hint="Oddziel komendy średnikiem (;)"
                onChange={v => onChangeSetting(s => s.herbPostUseCommand = v)}
            />
            <NumberField
                id="herbWieleCount"
                label={'Ilosc "wiele"'}
                value={settings.herbWieleCount}
                min={1}
                onChange={n => onChangeSetting(s => s.herbWieleCount = n > 0 ? n : 25)}
            />
        </SettingsCard>
    );
}

export function CuttingSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    return (
        <SettingsCard title="Wycinanie/Wyrywanie">
            <TextField
                id="cuttingPreAction"
                label="Komendy przed wycinaniem:"
                value={settings.cuttingPreAction}
                hint="Oddziel komendy średnikiem (;)"
                onChange={v => onChangeSetting(s => s.cuttingPreAction = v)}
            />
            <TextField
                id="cuttingPostAction"
                label="Komendy po wycinaniu:"
                value={settings.cuttingPostAction}
                hint="Oddziel komendy średnikiem (;)"
                onChange={v => onChangeSetting(s => s.cuttingPostAction = v)}
            />
        </SettingsCard>
    );
}

export function DrawSheatheSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    return (
        <SettingsCard title="Dobywanie/Opuszczanie">
            <SettingsHint>
                /dob bez argumentu wysyla komendy 1 i 2, /dob [1-3] wysyla wybrany slot. Analogicznie /op.
                Oddziel komendy srednikiem (;).
            </SettingsHint>
            <TextField id="dobCommand1" label="Komenda /dob 1:" value={settings.dobCommand1} onChange={v => onChangeSetting(s => s.dobCommand1 = v)}/>
            <TextField id="dobCommand2" label="Komenda /dob 2:" value={settings.dobCommand2} onChange={v => onChangeSetting(s => s.dobCommand2 = v)}/>
            <TextField id="dobCommand3" label="Komenda /dob 3:" value={settings.dobCommand3} onChange={v => onChangeSetting(s => s.dobCommand3 = v)}/>
            <TextField id="opCommand1" label="Komenda /op 1:" value={settings.opCommand1} onChange={v => onChangeSetting(s => s.opCommand1 = v)}/>
            <TextField id="opCommand2" label="Komenda /op 2:" value={settings.opCommand2} onChange={v => onChangeSetting(s => s.opCommand2 = v)}/>
            <TextField id="opCommand3" label="Komenda /op 3:" value={settings.opCommand3} onChange={v => onChangeSetting(s => s.opCommand3 = v)}/>
        </SettingsCard>
    );
}

export function LanguageSection({settings, onChangeSetting}: GeneralSettingsSectionProps) {
    const [aliasInput, setAliasInput] = useState<string>('');
    const [aliasAdjInput, setAliasAdjInput] = useState<string>('');
    const [aliasLangInput, setAliasLangInput] = useState<string>('potoczna');

    const addAlias = () => {
        const alias = aliasInput.trim();
        if (!alias) return;
        onChangeSetting(s => s.languageAliases = [...s.languageAliases, {
            alias,
            adjective: aliasAdjInput.trim(),
            language: aliasLangInput,
        }]);
        setAliasInput('');
        setAliasAdjInput('');
    };

    return (
        <SettingsCard title="Język" full>
            <TextField
                id="languageAdjective"
                label="Przyslowek"
                value={settings.languageAdjective}
                onChange={v => onChangeSetting(s => s.languageAdjective = v)}
            />
            {/* This one comes before the alias row's own language select on
                purpose: character-settings.spec.ts reaches it as the first
                <select> in the dialog offering "potoczna". */}
            <SelectField
                id="language"
                label="Domyślny język"
                value={settings.language}
                onChange={v => onChangeSetting(s => s.language = v)}
            >
                {languageOptions.map(lang => (
                    <option key={lang} value={lang}>{lang}</option>
                ))}
            </SelectField>
            <Table compact zebra hoverable>
                <thead>
                <TableRow>
                    <TableHeadCell>Alias</TableHeadCell>
                    <TableHeadCell>Przyslowek</TableHeadCell>
                    <TableHeadCell>Język</TableHeadCell>
                    <TableHeadCell/>
                </TableRow>
                </thead>
                <tbody>
                {settings.languageAliases.map(item => (
                    <TableRow key={item.alias}>
                        <TableCell>{item.alias}</TableCell>
                        <TableCell>{item.adjective}</TableCell>
                        <TableCell>{item.language}</TableCell>
                        <TableCell>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onChangeSetting(s => s.languageAliases = s.languageAliases.filter(a => a !== item))}
                            >
                                Usuń
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
                {/* Scratch row, not a setting: TableRow takes no data-* props
                    and the table styles plain <tr>, so this one stays raw. */}
                <tr data-settings-ignore>
                    <TableCell>
                        <TextField id="languageAliasNew" value={aliasInput} placeholder="np. /po" onChange={setAliasInput}/>
                    </TableCell>
                    <TableCell>
                        <TextField id="languageAliasAdjNew" value={aliasAdjInput} placeholder="np. potocznie" onChange={setAliasAdjInput}/>
                    </TableCell>
                    <TableCell>
                        <SelectField id="languageAliasLangNew" value={aliasLangInput} onChange={setAliasLangInput}>
                            {languageOptions.map(lang => (
                                <option key={lang} value={lang}>{lang}</option>
                            ))}
                        </SelectField>
                    </TableCell>
                    <TableCell>
                        <Button size="sm" onClick={addAlias}>Dodaj</Button>
                    </TableCell>
                </tr>
                </tbody>
            </Table>
        </SettingsCard>
    );
}
