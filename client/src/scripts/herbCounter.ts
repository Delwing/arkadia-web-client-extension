import Client from "../Client";
import {parseItems} from "./prettyContainers";
import loadHerbs, {HerbsData} from "./herbsLoader";
import {stripAnsiCodes} from "../Triggers";

const STORAGE_KEY = "herb_counts";

const biernikDigits = new Set([2, 3, 4]);

function getHerbCase(herbId: string, amount: number, herbsData?: HerbsData | null): string {
    const forms = herbsData?.herb_id_to_odmiana[herbId];
    if (!forms) return herbId;
    const num = Number(amount);
    if (num < 22) {
        if (num === 1) {
            return forms.biernik;
        }
        if (biernikDigits.has(num)) {
            return forms.mnoga_biernik;
        }
        return forms.mnoga_dopelniacz;
    }
    if (num % 10 > 1 && num % 10 < 5) {
        return forms.mnoga_biernik;
    }
    return forms.mnoga_dopelniacz;
}


const polishNumbers: Record<string, number> = {
    'jeden': 1, 'jedna': 1, 'jedno': 1,
    'jednego': 1,
    'jednej': 1,
    'dwa': 2, 'dwie': 2,
    'dwoch': 2,
    'trzy': 3,
    'trzech': 3,
    'cztery': 4,
    'czterech': 4,
    'piec': 5,
    'pieciu': 5,
    'szesc': 6,
    'szesciu': 6,
    'siedem': 7,
    'siedmiu': 7,
    'osiem': 8,
    'osmiu': 8,
    'dziewiec': 9,
    'dziewieciu': 9,
    'dziesiec': 10,
    'dziesieciu': 10,
    'jedenascie': 11,
    'jedenastu': 11,
    'dwanascie': 12,
    'dwunastu': 12,
    'trzynascie': 13,
    'trzynastu': 13,
    'czternascie': 14,
    'czternastu': 14,
    'pietnascie': 15,
    'pietnastu': 15,
    'szesnascie': 16,
    'szesnastu': 16,
    'siedemnascie': 17,
    'siedemnastu': 17,
    'osiemnascie': 18,
    'osiemnastu': 18,
    'dziewietnascie': 19,
    'dziewietnastu': 19,
    'dwadziescia': 20,
    'dwudziestu': 20,
    'dwadziescia jeden': 21, 'dwadziescia jedna': 21,
    'dwadziescia dwa': 22, 'dwadziescia dwie': 22,
    'dwudziestu dwoch': 22,
    'dwadziescia trzy': 23,
    'dwudziestu trzech': 23,
    'dwadziescia cztery': 24,
    'dwudziestu czterech': 24,
    'dwadziescia piec': 25,
    'dwudziestu pieciu': 25,
    'dwadziescia szesc': 26,
    'dwudziestu szesciu': 26,
    'dwadziescia siedem': 27,
    'dwudziestu siedmiu': 27,
    'dwadziescia osiem': 28,
    'dwudziestu osmiu': 28,
    'dwadziescia dziewiec': 29,
    'dwudziestu dziewieciu': 29,
    'trzydziesci': 30
};

function parseNumber(str: string): number {
    str = str.trim().toLowerCase();
    if (/^\d+$/.test(str)) return parseInt(str, 10);
    str = str.replace(/\s+/g, ' ');
    return polishNumbers[str] || 0;
}

export default async function initHerbCounter(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    let herbs: HerbsData | null = null;
    let loading: Promise<void> | null = null;
    const herbMap: Record<string, string> = {};
    let width = client.contentWidth;
    client.addEventListener('contentWidth', (ev: CustomEvent) => {
        width = ev.detail;
    });
    let storedBags: Record<number, Record<string, number>> = {};
    client.addEventListener('storage', (ev: CustomEvent) => {
        if (ev.detail.key === STORAGE_KEY) {
            storedBags = typeof ev.detail.value === 'object' && ev.detail.value ? ev.detail.value : {};
        }
    });
    client.port?.postMessage({ type: 'GET_STORAGE', key: STORAGE_KEY });

    async function ensureData() {
        if (!herbs) {
            if (!loading) {
                loading = loadHerbs().then(data => {
                    herbs = data;
                    if (herbs) {
                        Object.entries(herbs.herb_id_to_odmiana).forEach(([id, forms]) => {
                            Object.values(forms).forEach(f => {
                                herbMap[f.toLowerCase()] = id;
                            });
                        });
                    }
                }).finally(() => { loading = null; });
            }
            if (loading) {
                await loading;
            }
        }
    }

    const countRegex = /^Doliczyl(?:es|as) sie (?<num>[0-9a-z ]+) sztuki?\.$/;
    const contentRegex1 = /^Rozwiazujesz na chwile rzemyk, sprawdzajac zawartosc swojego.*woreczka.* W srodku dostrzegasz (?<content>.*)\.$/;
    const contentRegex2 = /^[> ]*Uwaznie ogladasz zawartosc[a-zA-Z -]*woreczka[a-z ]*\. W srodku dostrzegasz (?<content>[a-zA-Z0-9, -]+)\.$/;
    const emptyRegex = /^Rozwiazujesz na chwile rzemyk, sprawdzajac zawartosc swojego.*woreczka.* W jego srodku nic jednak nie ma\.$/;

    let awaiting = false;
    let left = 0;
    const totals: Record<string, number> = {};
    const bagTotals: Record<number, Record<string, number>> = {};
    let currentBag = 0;

    function buildSummary(bags: Record<number, Record<string, number>>): string[] {
        const totalsMap: Record<string, number> = {};
        Object.values(bags).forEach(contents => {
            Object.entries(contents).forEach(([id, c]) => {
                totalsMap[id] = (totalsMap[id] || 0) + c;
            });
        });
        const entries = Object.entries(totalsMap);
        if (entries.length === 0) {
            return ['Brak ziol.'];
        }
        const lines: string[] = [];
        const normal = width >= 63;
        if (normal) {
            lines.push('------+--------------------+---------------------------');
            lines.push('  ile |        nazwa       |              dzialanie           ');
            lines.push('------+--------------------+---------------------------');
        }

        const prefixWidth = normal ? 28 : 0;

        entries.sort((a, b) => a[0].localeCompare(b[0])).forEach(([id, c]) => {
            const uses = herbs?.herb_id_to_use[id]?.map(u => `${u.action}: ${u.effect}`).join(' | ') || '--';

            if (normal) {
                const base = `${String(c).padStart(5, ' ')} | ${id.padEnd(18, ' ')} | `;
                const available = width - stripAnsiCodes(base).length;
                if (available >= stripAnsiCodes(uses).length) {
                    lines.push(base + uses);
                } else if (available > 0) {
                    lines.push(base + uses.slice(0, available));
                    lines.push(' '.repeat(stripAnsiCodes(base).length) + uses.slice(available));
                } else {
                    lines.push(`${String(c).padStart(5, ' ')} | ${id}`);
                    lines.push(' '.repeat(prefixWidth) + uses);
                }
            } else {
                const base = `${String(c).padStart(3, ' ')} ${id}`;
                lines.push(base);
                lines.push(' '.repeat(4) + uses);
            }
        });
        if (normal) {
            lines.push('-----------------------------------------------------------');
        }
        if (Object.keys(bags).length > 0) {
            lines.push('');
            Object.entries(bags).forEach(([num, contents]) => {
                const parts = Object.entries(contents)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([id, c]) => `${c} ${id}`)
                    .join(', ');
                lines.push(`${num}. ${parts || '(pusty)'}`);
            });
        }
        return lines;
    }

    function finish() {
        storedBags = structuredClone(bagTotals);
        const lines = buildSummary(storedBags);
        client.println(lines.join('\n'));
        client.port?.postMessage({ type: 'SET_STORAGE', key: STORAGE_KEY, value: storedBags });
        awaiting = false;
        left = 0;
        Object.keys(totals).forEach(k => delete totals[k]);
        currentBag = 0;
        Object.keys(bagTotals).forEach(k => delete bagTotals[parseInt(k)]);
    }

    client.Triggers.registerTrigger(countRegex, (_r, _l, m) => {
        if (!awaiting) return undefined;
        left = parseNumber(m.groups?.num || m[1]);
        for (let i = 1; i <= left; i++) {
            client.sendCommand(`zajrzyj do ${i}. swojego woreczka`);
        }
        return undefined;
    });

    function extracHerbs(m: RegExpMatchArray) {
        if (!awaiting) return undefined;
        currentBag += 1;
        const items = parseItems(m.groups?.content || '');
        const bag: Record<string, number> = {};
        items.forEach(it => {
            const key = herbMap[it.name.toLowerCase()] || it.name.toLowerCase();
            const count = typeof it.count === 'number' ? it.count : parseNumber(String(it.count));
            totals[key] = (totals[key] || 0) + count;
            bag[key] = (bag[key] || 0) + count;
        });
        bagTotals[currentBag] = bag;
        left -= 1;
        if (left <= 0) finish();
        return undefined;
    }

    client.Triggers.registerTrigger(contentRegex1, (_r, _l, m) => {
        return extracHerbs(m);
    });

    client.Triggers.registerTrigger(contentRegex2, (_r, _l, m) => {
        return extracHerbs(m);
    });

    client.Triggers.registerTrigger(emptyRegex, () => {
        if (!awaiting) return undefined;
        currentBag += 1;
        bagTotals[currentBag] = {};
        left -= 1;
        if (left <= 0) finish();
        return undefined;
    });

    async function start() {
        await ensureData();
        awaiting = true;
        storedBags = {};
        currentBag = 0;
        Object.keys(bagTotals).forEach(k => delete bagTotals[parseInt(k)]);
        client.sendCommand('policz swoje woreczki');
    }

    async function take(herb: string, amount: number) {
        await ensureData();
        let leftToTake = amount;
        const bags = Object.keys(storedBags).map(n => parseInt(n)).sort((a, b) => a - b);
        for (const num of bags) {
            if (leftToTake <= 0) break;
            const contents = storedBags[num];
            const available = contents?.[herb] || 0;
            if (available <= 0) continue;
            const toTake = Math.min(available, leftToTake);
            client.sendCommand(`otworz ${num}. woreczek`);
            const form = getHerbCase(herb, toTake, herbs);
            if (toTake === 1) {
                client.sendCommand(`wez ${form} z ${num}. woreczka`);
            } else {
                client.sendCommand(`wez ${toTake} ${form} z ${num}. woreczka`);
            }
            client.sendCommand(`zamknij ${num}. woreczek`);
            contents[herb] = available - toTake;
            if (contents[herb] <= 0) delete contents[herb];
            leftToTake -= toTake;
        }
        client.port?.postMessage({ type: 'SET_STORAGE', key: STORAGE_KEY, value: storedBags });
    }

    if (aliases) {
        aliases.push({pattern: /\/ziola_buduj$/, callback: start});
        aliases.push({
            pattern: /\/ziola_pokaz$/, callback: () => {
                const listener = (ev: CustomEvent) => {
                    if (ev.detail.key === STORAGE_KEY) {
                        const bags = typeof ev.detail.value === 'object' && ev.detail.value ? ev.detail.value : {};
                        const lines = buildSummary(bags);
                        if (lines.length > 0) {
                            client.println(lines.join('\n'));
                        } else {
                            client.println('Brak podsumowania.');
                        }
                        client.removeEventListener('storage', listener);
                    }
                };
                client.addEventListener('storage', listener);
                client.port?.postMessage({ type: 'GET_STORAGE', key: STORAGE_KEY });
            }
        });
        aliases.push({ pattern: /^\/wezz ([a-z_]+) ([0-9]+)$/, callback: (m: RegExpMatchArray) => take(m[1].toLowerCase(), parseInt(m[2], 10)) });
        aliases.push({ pattern: /^\/wezz ([a-zA-Z_]+)$/, callback: (m: RegExpMatchArray) => take(m[1].toLowerCase(), 1) });
        aliases.push({
            pattern: /^\/zi (\w+) (\w+)$/,
            callback: async (m: RegExpMatchArray) => {
                const action = m[1];
                const herb = m[2].toLowerCase();
                await take(herb, 1);
                const biernik = herbs?.herb_id_to_odmiana[herb]?.biernik || herb;
                client.sendCommand(`${action} ${biernik}`);
            }
        });
    }

    // load herb data in background so it's ready after refresh
    ensureData().catch(() => {});
}
