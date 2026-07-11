import type { GmcpCharInfo } from '@shared/events/gmcpTypes';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Gender → engraved sigil for the medallion's corner pip.
const GENDER_SIGIL: Record<string, string> = { male: '♂', female: '♀' };

// Occupational guild (`guild_occ`) → the emblem engraved in the crest medallion,
// plus its temper: `war` (bojowe) get a blood rim, `civ` (niebojowe) a gold one.
// Keys are matched case-insensitively against the raw GMCP guild name.
const OCC_EMBLEMS: { occ: string; icon: string; kind: 'war' | 'civ' }[] = [
    { occ: 'Barbarzynca', icon: 'e-hammer', kind: 'war' },
    { occ: 'Fanatyk', icon: 'e-flame', kind: 'war' },
    { occ: 'Gladiator', icon: 'e-morningstar', kind: 'war' },
    { occ: 'Korsarz', icon: 'e-anchor', kind: 'war' },
    { occ: 'Lancknecht', icon: 'e-greatsword', kind: 'war' },
    { occ: 'Legionista', icon: 'e-swordshield', kind: 'war' },
    { occ: 'Nozownik', icon: 'e-daggers', kind: 'war' },
    { occ: 'Partyzant', icon: 'e-arrows', kind: 'war' },
    { occ: 'Straznik', icon: 'e-spear', kind: 'war' },
    { occ: 'Kupiec', icon: 'e-scales', kind: 'civ' },
    { occ: 'Mysliwy', icon: 'e-bow', kind: 'civ' },
    { occ: 'Odkrywca', icon: 'e-compass', kind: 'civ' },
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

// <svg viewBox="0 0 20 20"><use href="#icon"/></svg> referencing an IconDefs symbol.
const buildEmblem = (icon: string): SVGSVGElement => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#${icon}`);
    svg.appendChild(use);
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
    plaque.className = 'plaque forged';

    const emblem = info.guild_occ ? EMBLEM_BY_OCC.get(foldKey(info.guild_occ)) : undefined;

    const crest = document.createElement('div');
    crest.className = 'plaque__crest' + (emblem ? ` plaque__crest--${emblem.kind}` : '');
    crest.appendChild(buildEmblem(emblem ? emblem.icon : 'e-crest'));
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
