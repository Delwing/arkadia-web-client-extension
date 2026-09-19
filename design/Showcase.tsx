import { useEffect, useMemo, useState } from "react";
import {
    applyTheme,
    Badge,
    Button,
    Callout,
    Checkbox,
    Chip,
    Dialog,
    DialogBody,
    DialogClose,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    EmptyState,
    Field,
    Icon,
    IconButton,
    Input,
    InputShell,
    Kbd,
    Menu,
    MenuItem,
    MenuLabel,
    MenuSeparator,
    randomThemeColor,
    Segmented,
    Select,
    Spinner,
    Switch,
    TabPanel,
    Tabs,
    THEME_CATALOG,
    Toggle,
    Tooltip,
    TooltipProvider,
    type ThemeId,
} from "@design";
import { LogViewer } from "@ui/logViewer";
import { buildMockSessions } from "./mockSessions";
import "./showcase.css";

const STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const SEMANTIC_GROUPS: { title: string; tokens: string[] }[] = [
    {
        title: "Powierzchnie",
        tokens: ["--ark-bg-app", "--ark-bg-surface", "--ark-bg-raised", "--ark-bg-sunken"],
    },
    {
        title: "Elementy",
        tokens: [
            "--ark-bg-element",
            "--ark-bg-element-hover",
            "--ark-bg-element-active",
            "--ark-bg-selected",
        ],
    },
    {
        title: "Obramowania",
        tokens: ["--ark-border-subtle", "--ark-border", "--ark-border-element", "--ark-border-strong"],
    },
    {
        title: "Tekst",
        tokens: ["--ark-text", "--ark-text-secondary", "--ark-text-tertiary", "--ark-text-faint"],
    },
    {
        title: "Akcent",
        tokens: ["--ark-accent-bg", "--ark-accent-border", "--ark-accent-solid", "--ark-accent-text"],
    },
    {
        title: "Statusy",
        tokens: ["--ark-success-solid", "--ark-warning-solid", "--ark-danger-solid", "--ark-info-solid"],
    },
];

function Swatch({ token }: { token: string }) {
    return (
        <div className="sc-swatch">
            <span className="sc-swatch__chip" style={{ background: `var(${token})` }} />
            <code className="sc-swatch__name">{token.replace("--ark-", "")}</code>
        </div>
    );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
    return (
        <section className="sc-section">
            <div className="sc-section__head">
                <h2 className="sc-section__title">{title}</h2>
                {note ? <p className="sc-section__note">{note}</p> : null}
            </div>
            {children}
        </section>
    );
}

function Specimen({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="sc-specimen">
            <span className="sc-specimen__label">{label}</span>
            <div className="sc-specimen__body">{children}</div>
        </div>
    );
}

export default function Showcase() {
    const [theme, setTheme] = useState<ThemeId>("arkadia");
    const [customColor, setCustomColor] = useState(() => randomThemeColor());
    const [tab, setTab] = useState("primitives");

    // Component demo state.
    const [text, setText] = useState("kunszt");
    const [toggleOn, setToggleOn] = useState(true);
    const [chipOn, setChipOn] = useState(true);
    const [checked, setChecked] = useState(true);
    const [switched, setSwitched] = useState(true);
    const [segment, setSegment] = useState("log");
    const [selected, setSelected] = useState("compact");
    const [dialogOpen, setDialogOpen] = useState(false);

    const sessions = useMemo(() => buildMockSessions(), []);

    useEffect(() => {
        const root = document.getElementById("root");
        if (!root) return;
        const appearance =
            THEME_CATALOG.find((entry) => entry.id === theme)?.appearance ?? "dark";
        applyTheme(root, { theme, customColor, appearance: theme === "custom" ? "dark" : appearance });
    }, [theme, customColor]);

    return (
        <TooltipProvider>
            <header className="sc-header">
                <div className="ark-row">
                    <strong className="sc-brand">Arkadia — system projektowy</strong>
                    <span className="sc-brand__note">Radix + wlasny CSS</span>
                </div>
                <div className="ark-spacer" />
                <div className="ark-row">
                    <Field label="Motyw" inline htmlFor="sc-theme">
                        <Select
                            id="sc-theme"
                            value={theme}
                            onValueChange={(value) => setTheme(value as ThemeId)}
                            options={[
                                ...THEME_CATALOG.map((entry) => ({ value: entry.id, label: entry.label })),
                                { value: "custom", label: "Wlasny kolor" },
                            ]}
                        />
                    </Field>
                    {theme === "custom" ? (
                        <>
                            <input
                                type="color"
                                className="sc-color"
                                value={customColor}
                                onChange={(event) => setCustomColor(event.target.value)}
                                title="Kolor wiodacy"
                            />
                            <Button size="sm" onClick={() => setCustomColor(randomThemeColor())}>
                                Losuj
                            </Button>
                        </>
                    ) : null}
                </div>
            </header>

            <Tabs
                value={tab}
                onValueChange={setTab}
                className="sc-tabs"
                items={[
                    { value: "primitives", label: "Komponenty" },
                    { value: "tokens", label: "Tokeny" },
                    { value: "log-viewer", label: "Przegladarka logow" },
                ]}
            >
                <TabPanel value="primitives" className="sc-panel">
                    <Section
                        title="Przyciski"
                        note="solid jest zarezerwowany dla jednej glownej akcji w widoku — dzieki temu 'ten w kolorze akcentu' cos znaczy."
                    >
                        <Specimen label="warianty">
                            <Button variant="solid">Zapisz</Button>
                            <Button>Anuluj</Button>
                            <Button variant="outline">Obramowany</Button>
                            <Button variant="ghost">Przezroczysty</Button>
                            <Button variant="danger">Usun</Button>
                            <Button variant="danger-soft">Usun (lagodny)</Button>
                            <Button variant="link">Pokaz wszystkie</Button>
                        </Specimen>
                        <Specimen label="rozmiary i stany">
                            <Button size="sm">Maly</Button>
                            <Button>Sredni</Button>
                            <Button size="lg">Duzy</Button>
                            <Button icon={<Icon name="export" size={14} />}>Z ikona</Button>
                            <Button disabled>Nieaktywny</Button>
                        </Specimen>
                        <Specimen label="ikony">
                            <IconButton title="Zamknij">
                                <Icon name="close" />
                            </IconButton>
                            <IconButton title="Szukaj" size="sm">
                                <Icon name="search" size={14} />
                            </IconButton>
                            <IconButton title="Bez obramowania" plain>
                                <Icon name="filters" />
                            </IconButton>
                            <IconButton title="Nieaktywny" disabled>
                                <Icon name="chevron-right" />
                            </IconButton>
                        </Specimen>
                    </Section>

                    <Section title="Pola">
                        <Specimen label="tekst">
                            <div style={{ width: 260 }}>
                                <Input value={text} onChange={(event) => setText(event.target.value)} />
                            </div>
                            <div style={{ width: 260 }}>
                                <Input mono value={text} onChange={(event) => setText(event.target.value)} />
                            </div>
                            <div style={{ width: 200 }}>
                                <Input invalid value="[niedomkniety" onChange={() => undefined} />
                            </div>
                        </Specimen>
                        <Specimen label="pole wyszukiwania">
                            <InputShell
                                icon={<Icon name="search" size={14} />}
                                adornments={
                                    <>
                                        <Toggle pressed={false} onPressedChange={() => undefined} shape="square">
                                            Aa
                                        </Toggle>
                                        <Toggle pressed onPressedChange={() => undefined} shape="square" mono>
                                            .*
                                        </Toggle>
                                    </>
                                }
                            >
                                <Input size="lg" mono value={text} onChange={() => undefined} style={{ width: 320, paddingRight: 70 }} />
                            </InputShell>
                        </Specimen>
                        <Specimen label="etykiety i podpowiedzi">
                            <Field label="Nazwa postaci" hint="Widoczna tylko lokalnie" htmlFor="sc-name">
                                <Input id="sc-name" defaultValue="Kethra" style={{ width: 220 }} />
                            </Field>
                            <Field label="Wzorzec" error="Bledny wzorzec" htmlFor="sc-pattern">
                                <Input id="sc-pattern" invalid mono defaultValue="[a-" style={{ width: 220 }} />
                            </Field>
                        </Specimen>
                    </Section>

                    <Section title="Przelaczniki i wybory">
                        <Specimen label="toggle">
                            <Toggle pressed={toggleOn} onPressedChange={setToggleOn}>
                                Zawijanie
                            </Toggle>
                            <Toggle pressed={!toggleOn} onPressedChange={() => setToggleOn(!toggleOn)} size="md">
                                Tylko trafienia
                            </Toggle>
                            <Toggle pressed={toggleOn} onPressedChange={setToggleOn} shape="square" mono>
                                .*
                            </Toggle>
                        </Specimen>
                        <Specimen label="chip">
                            <Chip label="Rozmowy" count={7} pressed={chipOn} onPressedChange={setChipOn} />
                            <Chip label="Walka" count={80} pressed={!chipOn} onPressedChange={() => setChipOn(!chipOn)} />
                            <Chip label="System" count={18} pressed onPressedChange={() => undefined} />
                        </Specimen>
                        <Specimen label="segmented / select">
                            <Segmented
                                value={segment}
                                onValueChange={setSegment}
                                options={[
                                    { value: "log", label: "Ten log" },
                                    { value: "all", label: "Wszystkie logi" },
                                ]}
                            />
                            <Select
                                value={selected}
                                onValueChange={setSelected}
                                options={[
                                    { value: "compact", label: "Gesto" },
                                    { value: "comfortable", label: "Luzno" },
                                ]}
                            />
                        </Specimen>
                        <Specimen label="checkbox / switch">
                            <Field label="Zapisuj logi" inline htmlFor="sc-check">
                                <Checkbox id="sc-check" checked={checked} onCheckedChange={setChecked} />
                            </Field>
                            <Field label="Sledz na zywo" inline htmlFor="sc-switch">
                                <Switch id="sc-switch" checked={switched} onCheckedChange={setSwitched} />
                            </Field>
                        </Specimen>
                    </Section>

                    <Section title="Sygnalizacja">
                        <Specimen label="badge">
                            <Badge>12</Badge>
                            <Badge tone="accent">55</Badge>
                            <Badge tone="accent-soft">3</Badge>
                            <Badge tone="success" status dot="live">
                                Nagrywanie
                            </Badge>
                            <Badge tone="danger">Blad</Badge>
                        </Specimen>
                        <Specimen label="callout">
                            <Callout tone="info" icon={<Icon name="sparkle" size={16} />}>
                                Filtry przenosza sie miedzy sesjami.
                            </Callout>
                            <Callout tone="warning" icon={<Icon name="warning" size={16} />}>
                                Ta sesja jest nadal nagrywana.
                            </Callout>
                        </Specimen>
                        <Specimen label="pozostale">
                            <Spinner />
                            <Spinner size="lg" />
                            <span className="ark-row ark-row--tight">
                                <Kbd>Ctrl</Kbd>
                                <Kbd>F</Kbd>
                            </span>
                            <Tooltip content="Podpowiedz nad kontrolka">
                                <Button size="sm">Najedz na mnie</Button>
                            </Tooltip>
                        </Specimen>
                        <Specimen label="pusty stan">
                            <EmptyState
                                message="Zadna linia w tym logu nie pasuje do zapytania."
                                action={<Button size="sm">Zresetuj filtry</Button>}
                            />
                        </Specimen>
                    </Section>

                    <Section title="Warstwy" note="Radix odpowiada za pulapke fokusu, blokade przewijania i zamykanie.">
                        <Specimen label="dialog / menu">
                            <Button onClick={() => setDialogOpen(true)}>Otworz okno</Button>
                            <Menu
                                trigger={
                                    <Button trailing={<Icon name="chevron-down" size={14} />}>Eksport</Button>
                                }
                            >
                                <MenuLabel>Zapisz jako</MenuLabel>
                                <MenuItem onSelect={() => undefined}>Tekst (.txt)</MenuItem>
                                <MenuItem onSelect={() => undefined}>HTML</MenuItem>
                                <MenuSeparator />
                                <MenuItem onSelect={() => undefined} disabled>
                                    JSON (wkrotce)
                                </MenuItem>
                            </Menu>
                        </Specimen>
                    </Section>
                </TabPanel>

                <TabPanel value="tokens" className="sc-panel">
                    <Section
                        title="Skale"
                        note="Dwanascie krokow o stalym znaczeniu. Motyw to wybor dwoch skal — reszta systemu sie nie zmienia."
                    >
                        <div className="sc-scale">
                            <span className="sc-scale__label">neutralna</span>
                            {STEPS.map((step) => (
                                <span
                                    key={`gray-${step}`}
                                    className="sc-scale__step"
                                    style={{ background: `var(--ark-gray-${step})` }}
                                    title={`--ark-gray-${step}`}
                                >
                                    {step}
                                </span>
                            ))}
                        </div>
                        <div className="sc-scale">
                            <span className="sc-scale__label">akcent</span>
                            {STEPS.map((step) => (
                                <span
                                    key={`accent-${step}`}
                                    className="sc-scale__step"
                                    style={{ background: `var(--ark-accent-${step})` }}
                                    title={`--ark-accent-${step}`}
                                >
                                    {step}
                                </span>
                            ))}
                        </div>
                    </Section>

                    <Section title="Role" note="Komponenty siegaja po te tokeny, nigdy po surowe kroki.">
                        <div className="sc-tokens">
                            {SEMANTIC_GROUPS.map((group) => (
                                <div key={group.title} className="sc-tokens__group">
                                    <h3 className="sc-tokens__title">{group.title}</h3>
                                    {group.tokens.map((token) => (
                                        <Swatch key={token} token={token} />
                                    ))}
                                </div>
                            ))}
                        </div>
                    </Section>

                    <Section title="Typografia">
                        <div className="sc-type">
                            {[
                                ["--ark-text-8", "Tytul strony"],
                                ["--ark-text-7", "Tytul okna"],
                                ["--ark-text-6", "Nazwa na liscie"],
                                ["--ark-text-5", "Tekst podstawowy i logi"],
                                ["--ark-text-4", "Kontrolki drugorzedne"],
                                ["--ark-text-3", "Pasek stanu"],
                                ["--ark-text-2", "Gesta metadana"],
                                ["--ark-text-1", "Etykiety wersalikami"],
                            ].map(([token, label]) => (
                                <div key={token} className="sc-type__row">
                                    <code className="sc-type__token">{token.replace("--ark-", "")}</code>
                                    <span style={{ fontSize: `var(${token})` }}>{label}</span>
                                </div>
                            ))}
                            <div className="sc-type__row">
                                <code className="sc-type__token">font-mono</code>
                                <span className="ark-mono ark-tabular">20:41:03 · 1h 38m · 156 ln</span>
                            </div>
                        </div>
                    </Section>

                    <Section title="Odstepy i promienie">
                        <div className="sc-ramp">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((step) => (
                                <div key={step} className="sc-ramp__item">
                                    <span
                                        className="sc-ramp__bar"
                                        style={{ width: `var(--ark-space-${step})` }}
                                    />
                                    <code>space-{step}</code>
                                </div>
                            ))}
                        </div>
                        <div className="sc-ramp">
                            {[1, 2, 3, 4, 5].map((step) => (
                                <div key={step} className="sc-ramp__item">
                                    <span
                                        className="sc-ramp__radius"
                                        style={{ borderRadius: `var(--ark-radius-${step})` }}
                                    />
                                    <code>radius-{step}</code>
                                </div>
                            ))}
                        </div>
                    </Section>
                </TabPanel>

                <TabPanel value="log-viewer" className="sc-panel sc-panel--flush">
                    <div className="sc-viewer">
                        <LogViewer sessions={sessions} />
                    </div>
                </TabPanel>
            </Tabs>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen} size="sm" theme={theme}>
                <DialogHeader compact>
                    <DialogTitle>Usunac sesje?</DialogTitle>
                    <div className="ark-spacer" />
                    <DialogClose />
                </DialogHeader>
                <DialogBody padded>
                    Tej operacji nie mozna cofnac. Zapisane linie znikna z tego urzadzenia.
                </DialogBody>
                <DialogFooter>
                    <Button onClick={() => setDialogOpen(false)}>Anuluj</Button>
                    <Button variant="danger" onClick={() => setDialogOpen(false)}>
                        Usun
                    </Button>
                </DialogFooter>
            </Dialog>
        </TooltipProvider>
    );
}
