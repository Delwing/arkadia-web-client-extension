import Client from "../Client";
import {parseItems} from "./prettyContainers";
import loadHerbs, {HerbsData} from "./herbsLoader";
import {stripAnsiCodes} from "../Triggers";
import {color, colorString, findClosestColor, mudletColorLine} from "../Colors";
import { openHerbContextMenu } from "../contextMenus";
import type { HerbManagerApi, HerbMoveOptions, HerbBagsState, HerbBagState } from "../types/herbs";
import { clampHerbBagCondition, normalizeHerbBagsState } from "../types/herbs";
import { getWearValue } from "./wearUsed";

const headerColor = findClosestColor('#8470ff')
const WHITE = findClosestColor('#ffffff');
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
    let storedBags: HerbBagsState = {};
    let currentBagForEvaluation = 1;

    const ensureBagState = (bagNumber: number): HerbBagState => {
        let bag = storedBags[bagNumber];
        if (!bag) {
            bag = { herbs: {} };
            storedBags[bagNumber] = bag;
        } else if (!bag.herbs) {
            bag.herbs = {};
        }
        return bag;
    };

    const cloneBags = () => structuredClone(storedBags);

    const persistBags = () => {
        const snapshot = normalizeHerbBagsState(cloneBags());
        client.port?.postMessage({ type: 'SET_STORAGE', key: STORAGE_KEY, value: snapshot });
        client.sendEvent('herbCounts', structuredClone(snapshot));
        storedBags = snapshot;
    };

    const broadcastBags = () => {
        client.sendEvent('herbCounts', structuredClone(storedBags));
    };

    const requestBagsIfNeeded = () => {
        if (Object.keys(storedBags).length > 0) {
            broadcastBags();
        } else {
            client.port?.postMessage({ type: 'GET_STORAGE', key: STORAGE_KEY });
        }
    };

    client.addEventListener('storage', async (ev: CustomEvent) => {
        if (ev.detail.key === STORAGE_KEY) {
            storedBags = normalizeHerbBagsState(ev.detail.value);
            await ensureData();
            broadcastBags();
        }
    });
    client.port?.postMessage({ type: 'GET_STORAGE', key: STORAGE_KEY });
    window.addEventListener('request-herb-counts', requestBagsIfNeeded);

    let preUseCommands: string[] = [];
    let postUseCommands: string[] = [];
    client.addEventListener('settings', (ev: CustomEvent) => {
        const st = ev.detail || {};
        preUseCommands = typeof st.herbPreUseCommand === 'string'
            ? st.herbPreUseCommand.split(';').map((c: string) => c.trim()).filter(Boolean)
            : [];
        postUseCommands = typeof st.herbPostUseCommand === 'string'
            ? st.herbPostUseCommand.split(';').map((c: string) => c.trim()).filter(Boolean)
            : [];
    });

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
    const bagConditionRegex = /^Ten element ekwipunku wyglada na (?<desc>.+)$/i;

    let awaiting = false;
    let left = 0;
    const totals: Record<string, number> = {};
    const bagTotals: Record<number, HerbBagState> = {};
    const pendingConditions: Record<number, number> = {};
    let conditionFlushHandle: ReturnType<typeof setTimeout> | null = null;

    const scheduleConditionFlush = () => {
        if (conditionFlushHandle) return;
        conditionFlushHandle = setTimeout(() => {
            conditionFlushHandle = null;
            const entries = Object.entries(pendingConditions as Record<string, number>);
            Object.keys(pendingConditions as Record<string, number>).forEach(key => {
                delete (pendingConditions as Record<string, number>)[key];
            });
            if (entries.length === 0) {
                return;
            }
            let changed = false;
            for (const [key, rawValue] of entries) {
                const bagNumber = Number(key);
                if (!Number.isFinite(bagNumber) || bagNumber <= 0) {
                    continue;
                }
                const condition = clampHerbBagCondition(rawValue);
                const bag = ensureBagState(bagNumber);
                if (bag.condition !== condition) {
                    bag.condition = condition;
                    changed = true;
                }
            }
            if (changed) {
                persistBags();
            } else {
                broadcastBags();
            }
        }, 100);
    };

    const resolveWearValue = (desc: string): number | undefined => {
        const trimmed = desc.trim();
        if (!trimmed) {
            return undefined;
        }
        const direct = getWearValue(trimmed);
        if (direct != null) {
            return direct;
        }
        if (trimmed.endsWith('.')) {
            return getWearValue(trimmed.slice(0, -1));
        }
        return getWearValue(`${trimmed}.`);
    };
    let currentBag = 0;

    const showHerbActions = (id: string, ev: MouseEvent) => {
        openHerbContextMenu(client, {
            herbId: id,
            actions: herbs?.herb_id_to_use[id],
            x: ev.pageX,
            y: ev.pageY,
            commandPrefix: '/zi',
            preUseCommands,
            postUseCommands,
        });
    };

    const formatHerbName = (herbId: string, amount = 1): string => {
        const forms = herbs?.herb_id_to_odmiana?.[herbId];
        if (!forms) {
            return herbId;
        }
        if (amount === 1) {
            return forms.mianownik;
        }
        if (amount > 1) {
            return forms.mnoga_mianownik;
        }
        return forms.mianownik;
    };

    function buildSummary(
        bags: HerbBagsState,
        includeBags = true,
        useFormattedNames = true
    ): string[] {
        const totalsMap: Record<string, number> = {};
        Object.values(bags).forEach(bag => {
            const contents = bag?.herbs ?? {};
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
            lines.push('------+--------------------+-------------------------------');
            lines.push(`  ${colorString('ile', headerColor)} |        ${colorString('nazwa', headerColor)}       |            ${colorString('dzialanie', headerColor)}             `);
            lines.push('------+--------------------+-------------------------------');
        }

        const prefixWidth = normal ? 28 : 0;

        entries.sort((a, b) => a[0].localeCompare(b[0])).forEach(([id, c]) => {
            const uses = herbs?.herb_id_to_use[id]?.map(u => `${u.action}: ${mudletColorLine(u.effect)}`).join(' | ') || '--';
            const herbName = useFormattedNames ? formatHerbName(id, c) : id;

            if (normal) {
                const name = client.OutputHandler.makeStringRightClickable(herbName, (ev) => showHerbActions(id, ev));
                const base = `${String(c).padStart(5, ' ')} | ${name.padEnd(43, ' ')} | `;
                const available = width - stripAnsiCodes(base).length;
                if (available >= stripAnsiCodes(uses).length) {
                    lines.push(base + uses);
                } else if (available > 0) {
                    lines.push(base + uses.slice(0, available));
                    lines.push(' '.repeat(stripAnsiCodes(base).length) + uses.slice(available));
                } else {
                    lines.push(`${String(c).padStart(5, ' ')} | ${client.OutputHandler.makeStringRightClickable(herbName, (ev) => showHerbActions(id, ev))}`);
                    lines.push(' '.repeat(prefixWidth) + uses);
                }
            } else {
                const base = `${String(c).padStart(3, ' ')} ${client.OutputHandler.makeStringRightClickable(herbName, (ev) => showHerbActions(id, ev))}`;
                lines.push(base);
                lines.push(' '.repeat(4) + uses);
            }
        });
        if (normal) {
            lines.push('-----------------------------------------------------------');
        }
        if (includeBags && Object.keys(bags).length > 0) {
            lines.push('');
            Object.entries(bags).forEach(([num, bagState]) => {
                const contents = bagState?.herbs ?? {};
                const parts = Object.entries(contents)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([id, c]) => {
                        const name = useFormattedNames ? formatHerbName(id, c) : id;
                        return `${c} ${client.OutputHandler.makeStringRightClickable(name, (ev) => showHerbActions(id, ev))}`;
                    })
                    .join(', ');
                const condition = bagState?.condition;
                const conditionSuffix = typeof condition === 'number' ? ` [${condition}/5]` : '';
                lines.push(`${num}. ${parts || '(pusty)'}${conditionSuffix}`);
            });
        }

        return lines.map(line => color(WHITE) + line);
    }

    function finish() {
        storedBags = normalizeHerbBagsState(structuredClone(bagTotals));
        const lines = buildSummary(storedBags, true, false);
        client.println(lines.join('\n'));
        persistBags();
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
        bagTotals[currentBag] = { herbs: bag };
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
        bagTotals[currentBag] = { herbs: {} };
        left -= 1;
        if (left <= 0) finish();
        return undefined;
    });

    client.Triggers.registerTrigger(bagConditionRegex, (_raw, _line, m) => {
        const desc = m.groups?.desc;
        if (!desc) return undefined;
        const bagNumber = currentBagForEvaluation++
        if (!Number.isFinite(bagNumber) || bagNumber <= 0) return undefined;
        const wearValue = resolveWearValue(desc);
        if (wearValue == null) return undefined;
        pendingConditions[bagNumber] = wearValue;
        scheduleConditionFlush();
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

    function evaluateBagConditions() {
        Object.keys(pendingConditions as Record<string, number>).forEach(key => {
            delete (pendingConditions as Record<string, number>)[key];
        });
        if (conditionFlushHandle) {
            clearTimeout(conditionFlushHandle);
            conditionFlushHandle = null;
        }
        currentBagForEvaluation = 1;
        client.sendCommand('ocen wszystkie woreczki');
    }

    async function take(herb: string, amount: number, fromBag?: number): Promise<number> {
        await ensureData();
        if (amount <= 0) {
            return 0;
        }
        let leftToTake = amount;
        let removed = 0;
        const bags = typeof fromBag === 'number'
            ? [fromBag]
            : Object.keys(storedBags).map(n => parseInt(n)).sort((a, b) => a - b);
        for (const num of bags) {
            if (leftToTake <= 0) break;
            const bag = storedBags[num];
            const contents = bag?.herbs;
            if (!bag || !contents) continue;
            const available = contents[herb] ?? 0;
            if (available <= 0) continue;
            const toTake = Math.min(available, leftToTake);
            if (toTake <= 0) continue;
            client.sendCommand(`otworz ${num}. swoj woreczek`);
            const form = getHerbCase(herb, toTake, herbs);
            if (toTake === 1) {
                client.sendCommand(`wez ${form} z ${num}. swojego woreczka`);
            } else {
                client.sendCommand(`wez ${toTake} ${form} z ${num}. swojego woreczka`);
            }
            client.sendCommand(`zamknij ${num}. swoj woreczek`);
            const remaining = available - toTake;
            if (remaining > 0) {
                contents[herb] = remaining;
            } else {
                delete contents[herb];
            }
            leftToTake -= toTake;
            removed += toTake;
        }
        if (removed > 0) {
            persistBags();
        }
        return removed;
    }

    async function put(herb: string, amount: number, bag: number): Promise<number> {
        await ensureData();
        if (amount <= 0) {
            return 0;
        }
        const bagNumber = Number.isFinite(bag) ? Math.floor(bag) : NaN;
        if (!Number.isFinite(bagNumber) || bagNumber <= 0) {
            return 0;
        }
        const toInsert = Math.max(1, Math.floor(amount));
        client.sendCommand(`otworz ${bagNumber}. swoj woreczek`);
        const form = getHerbCase(herb, toInsert, herbs);
        if (toInsert === 1) {
            client.sendCommand(`wloz ${form} do ${bagNumber}. swojego woreczka`);
        } else {
            client.sendCommand(`wloz ${toInsert} ${form} do ${bagNumber}. swojego woreczka`);
        }
        client.sendCommand(`zamknij ${bagNumber}. swoj woreczek`);
        const bagState = ensureBagState(bagNumber);
        bagState.herbs[herb] = (bagState.herbs[herb] || 0) + toInsert;
        persistBags();
        return toInsert;
    }

    async function move(options: HerbMoveOptions): Promise<void> {
        const { herbId, amount, fromBag, toBag } = options;
        if (!herbId || fromBag === toBag) {
            return;
        }
        const taken = await take(herbId, amount, fromBag);
        if (taken > 0) {
            await put(herbId, taken, toBag);
        }
    }

    const herbManager: HerbManagerApi = {
        getBags: cloneBags,
        take,
        put,
        move,
    };

    client.herbManager = herbManager;

    if (aliases) {
        aliases.push({pattern: /\/ziola_buduj$/, callback: start});
        aliases.push({pattern: /\/woreczki_buduj$/, callback: evaluateBagConditions});
        aliases.push({
            pattern: /\/ziola_pokaz$/, callback: () => {
                const listener = async (ev: CustomEvent) => {
                    if (ev.detail.key === STORAGE_KEY) {
                        const bags = normalizeHerbBagsState(ev.detail.value);
                        await ensureData();
                        const lines = buildSummary(bags, false, false);
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
        aliases.push({
            pattern: /\/ziola$/, callback: () => {
                client.sendEvent('herbManagerOpen');
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
                preUseCommands.forEach(cmd => client.sendCommand(cmd));
                client.sendCommand(`${action} ${biernik}`);
                postUseCommands.forEach(cmd => client.sendCommand(cmd));
            }
        });

        aliases.push({
            pattern: /^\/zi (\w+) (\w+) (\d+)$/,
            callback: async (m: RegExpMatchArray) => {
                const action = m[1];
                const herb = m[2].toLowerCase();
                let amount = parseNumber(m[3]);
                if (isNaN(amount)) {
                    amount = 1;
                }
                await take(herb, amount);
                const biernik = herbs?.herb_id_to_odmiana[herb]?.mnoga_biernik || herb;
                preUseCommands.forEach(cmd => client.sendCommand(cmd));
                client.sendCommand(`${action} ${amount} ${biernik}`);
                postUseCommands.forEach(cmd => client.sendCommand(cmd));
            }
        });
    }

    // load herb data in background so it's ready after refresh
    ensureData().catch(() => {});
}
