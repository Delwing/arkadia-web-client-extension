import type { GmcpCharInfo } from '@shared/events/gmcpTypes';

const SVG_NS = 'http://www.w3.org/2000/svg';

// The emblems, drawn on a 0-20 grid at a hairline 1.15 stroke and inlined, so a
// plaque carries its own drawing wherever it lands (the log, the split view, a
// saved log). `crest` is the neutral fallback for an unmapped or absent guild.
const EMBLEMS: Record<string, string> = {
    hammer: '<path d="M5.4 5.2h9.2a1 1 0 0 1 1 1v2.6a1 1 0 0 1-1 1H5.4a1 1 0 0 1-1-1V6.2a1 1 0 0 1 1-1z" /><path d="M7.6 5.2v4.6M12.4 5.2v4.6" /><path d="M10 9.8V17" />',
    flame: '<path d="M10 2.4s4.2 4.2 4.2 8.1a4.2 4.2 0 0 1-8.4 0c0-1.6 1-2.9 1-2.9.3 1 .9 1.5.9 1.5.1-2.1 2.3-4.7 2.3-6.8z" /><path d="M10 16.6a2.3 2.3 0 0 0 2.3-2.3c0-1.3-1.3-2.4-1.3-2.4" />',
    morningstar: '<path d="M5.4 16.6 9.5 10.4" /><circle cx="11.6" cy="8" r="3.1" /><path d="M11.6 3v1.9M11.6 11.1V13M6.5 8h1.9M14.8 8h1.9M8 4.4l1.35 1.35M15.2 4.4l-1.35 1.35M8 11.6l1.35-1.35M15.2 11.6l-1.35-1.35" />',
    anchor: '<circle cx="10" cy="3.7" r="1.5" /><path d="M10 5.2V16.6" /><path d="M6.5 8h7" /><path d="M4.2 12.2a5.8 5.8 0 0 0 11.6 0" /><path d="M4.2 12.2 2.7 11M4.2 12.2l1.9.3M15.8 12.2 17.3 11M15.8 12.2l-1.9.3" />',
    greatsword: '<path d="M10 2.4v9.4" /><path d="M5.4 11.8h9.2" /><path d="M10 11.8v4" /><path d="M8.3 15.8h3.4" /><path d="M6.6 10.4 5.4 11.8 6.6 13.2M13.4 10.4 14.6 11.8 13.4 13.2" />',
    swordshield: '<path d="M5.9 3.6 2.9 4.6v3.2c0 2.5 1.5 4.1 3 4.9 1.5-.8 3-2.4 3-4.9V4.6z" /><path d="M13.4 2.2V12" /><path d="M10.8 12h5.2" /><path d="M13.4 12v4.4" /><path d="M12.1 16.4h2.6" />',
    daggers: '<g transform="rotate(40 10 6)"><path d="M10 1.8 8.8 11.6 11.2 11.6z" /><path d="M7.7 11.6h4.6" /><path d="M10 11.6v3.4" /><path d="M8.8 15h2.4" /></g><g transform="rotate(-40 10 6)"><path d="M10 1.8 8.8 11.6 11.2 11.6z" /><path d="M7.7 11.6h4.6" /><path d="M10 11.6v3.4" /><path d="M8.8 15h2.4" /></g>',
    arrows: '<g transform="rotate(45 10 10)"><path d="M10 2.6v14.8" /><path d="M10 2.6 8.4 4.7M10 2.6 11.6 4.7" /><path d="M8.6 15.2 10 13.6 11.4 15.2M8.6 13.6 10 12 11.4 13.6" /></g><g transform="rotate(-45 10 10)"><path d="M10 2.6v14.8" /><path d="M10 2.6 8.4 4.7M10 2.6 11.6 4.7" /><path d="M8.6 15.2 10 13.6 11.4 15.2M8.6 13.6 10 12 11.4 13.6" /></g>',
    spear: '<path d="M10 2.2C9 4.1 8.1 5.7 8.1 7 8.1 8.2 9 8.8 10 8.8 11 8.8 11.9 8.2 11.9 7 11.9 5.7 11 4.1 10 2.2z" /><path d="M10 8.8V17.6" /><path d="M8.5 9.4h3" />',
    scales: '<circle cx="10" cy="3.4" r="1" /><path d="M10 4.4V15.2" /><path d="M7.2 15.2h5.6" /><path d="M3.6 6.2h12.8" /><path d="M3.6 6.2 2 9.6h3.2zM16.4 6.2 14.8 9.6h3.2z" />',
    bow: '<path d="M7.8 2.8a9.2 9.2 0 0 1 0 14.4" /><path d="M7.8 2.8v14.4" /><path d="M2.4 10H17.2" /><path d="M17.2 10 14.7 8.3M17.2 10 14.7 11.7" /><path d="M2.4 8.4 4.2 10 2.4 11.6M3.9 8.4 5.7 10 3.9 11.6" />',
    compass: '<circle cx="10" cy="10" r="7" /><path d="M10 3.2v1.6" /><path d="M10 5 11.7 10 10 15 8.3 10z" /><circle cx="10" cy="10" r=".7" />',
    crest: '<path d="M10 2.5 11.7 8.3 17.5 10 11.7 11.7 10 17.5 8.3 11.7 2.5 10 8.3 8.3z" />',
};

// Gender → engraved sigil for the medallion's corner pip.
const GENDER_SIGIL: Record<string, string> = { male: '♂', female: '♀' };

// Occupational guild (`guild_occ`) → the emblem engraved in the crest medallion,
// plus its temper: `war` (bojowe) get a blood rim, `civ` (niebojowe) a gold one.
// Keys are matched case-insensitively against the raw GMCP guild name.
const OCC_EMBLEMS: { occ: string; icon: string; kind: 'war' | 'civ' }[] = [
    { occ: 'Barbarzynca', icon: 'hammer', kind: 'war' },
    { occ: 'Fanatyk', icon: 'flame', kind: 'war' },
    { occ: 'Gladiator', icon: 'morningstar', kind: 'war' },
    { occ: 'Korsarz', icon: 'anchor', kind: 'war' },
    { occ: 'Lancknecht', icon: 'greatsword', kind: 'war' },
    { occ: 'Legionista', icon: 'swordshield', kind: 'war' },
    { occ: 'Nozownik', icon: 'daggers', kind: 'war' },
    { occ: 'Partyzant', icon: 'arrows', kind: 'war' },
    { occ: 'Straznik', icon: 'spear', kind: 'war' },
    { occ: 'Kupiec', icon: 'scales', kind: 'civ' },
    { occ: 'Mysliwy', icon: 'bow', kind: 'civ' },
    { occ: 'Odkrywca', icon: 'compass', kind: 'civ' },
];

// The game sends guild names in ASCII, so a trim + lowercase is enough to match.
const foldKey = (s: string): string => s.trim().toLowerCase();

const EMBLEM_BY_OCC = new Map(OCC_EMBLEMS.map((e) => [foldKey(e.occ), e]));

// The guild lines, in the order they read on the plaque. `guild_occ` is not here
// — it's the crest emblem (and appears in the subtitle) instead.
const GUILD_ROWS: { key: keyof GmcpCharInfo; label: string }[] = [
    { key: 'guild_lay', label: 'Gildia' },
    { key: 'guild_race', label: 'Pochodzenie' },
    { key: 'guild_rel', label: 'Religia' },
];

const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const span = (className: string, text: string): HTMLSpanElement => {
    const el = document.createElement('span');
    el.className = className;
    el.textContent = text;
    return el;
};

const buildEmblem = (icon: string): SVGSVGElement => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.15');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.innerHTML = EMBLEMS[icon] ?? EMBLEMS.crest;
    return svg;
};

/**
 * Build the inline character plaque appended to the game log when the initial
 * `gmcp.char.info` arrives: a crest medallion carrying the occupational-guild
 * emblem (with a gender pip), the name and race/occupation, and the remaining
 * guild lines. Every field is optional — missing ones are simply skipped.
 */
export function buildCharPlaque(info: GmcpCharInfo): HTMLElement {
    const plaque = document.createElement('div');
    plaque.className = 'plaque';

    const emblem = info.guild_occ ? EMBLEM_BY_OCC.get(foldKey(info.guild_occ)) : undefined;

    const crest = document.createElement('div');
    crest.className = 'plaque__crest' + (emblem ? ` plaque__crest--${emblem.kind}` : '');
    crest.appendChild(buildEmblem(emblem ? emblem.icon : 'crest'));
    if (info.gender && GENDER_SIGIL[info.gender]) {
        const pip = span('plaque__pip', GENDER_SIGIL[info.gender]);
        pip.dataset.gender = info.gender;
        crest.appendChild(pip);
    }
    plaque.appendChild(crest);

    const main = document.createElement('div');
    main.className = 'plaque__main';
    main.appendChild(span('plaque__name', capitalize((info.name ?? '').trim()) || 'Nieznany'));
    const subParts = [info.race ? capitalize(info.race) : '', info.guild_occ?.trim() ?? ''].filter(Boolean);
    if (subParts.length) main.appendChild(span('plaque__sub', subParts.join(' · ')));
    plaque.appendChild(main);

    const guilds = GUILD_ROWS.map(({ key, label }) => ({ label, value: info[key] }))
        .filter((row): row is { label: string; value: string } => typeof row.value === 'string' && row.value.trim() !== '');

    if (guilds.length) {
        const list = document.createElement('div');
        list.className = 'plaque__guilds';
        for (const { label, value } of guilds) {
            const row = document.createElement('div');
            row.className = 'plaque__guild';
            row.appendChild(span('plaque__gk', label));
            row.appendChild(span('plaque__gv', value));
            list.appendChild(row);
        }
        plaque.appendChild(list);
    }

    return plaque;
}

/**
 * Feeds plaques to an output: `char.info` re-fires on gender or guild changes
 * of the same character, so a plaque is shown once per distinct character - a
 * fresh login as someone else shows it again.
 */
export function createCharPlaqueFeed(
    appendNode: (node: HTMLElement, rebuild: () => HTMLElement) => void,
): (info: GmcpCharInfo | undefined) => void {
    let shownFor: string | undefined;
    return (info) => {
        if (!info?.name) return;
        const id = info.object_num !== undefined ? String(info.object_num) : info.name.trim().toLowerCase();
        if (id === shownFor) return;
        shownFor = id;
        appendNode(buildCharPlaque(info), () => buildCharPlaque(info));
    };
}
