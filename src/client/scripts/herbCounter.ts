import Client from "../Client";
import {parseItems} from "./prettyContainers";
import loadHerbs, {HerbsData} from "./herbsLoader";
import {colorString, findClosestColor, mudletColorLine} from "@modules/core/Colors";
import {openHerbContextMenu} from "@modules/core/contextMenus";
import type {HerbMoveOptions, HerbBagsState, HerbBagState} from "../types/herbs";
import {clampHerbBagCondition, normalizeHerbBagsState} from "../types/herbs";
import {getWearValue} from "./wearUsed";
import {AnsiAwareBuffer} from "../ansi/FormatState";

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
    client.on('contentWidth', (value) => {
        width = value;
    });
    let storedBags: HerbBagsState = {};
    let currentBagForEvaluation = 1;

    const ensureBagState = (bagNumber: number): HerbBagState => {
        let bag = storedBags[bagNumber];
        if (!bag) {
            bag = {herbs: {}};
            storedBags[bagNumber] = bag;
        } else if (!bag.herbs) {
            bag.herbs = {};
        }
        return bag;
    };

    const cloneBags = () => structuredClone(storedBags);

    const persistBags = () => {
        const snapshot = normalizeHerbBagsState(cloneBags());
        client.port?.postMessage({type: 'SET_STORAGE', key: STORAGE_KEY, value: snapshot});
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
            client.port?.postMessage({type: 'GET_STORAGE', key: STORAGE_KEY});
        }
    };

    client.on('storage', async ({key, value}) => {
        if (key === STORAGE_KEY) {
            storedBags = normalizeHerbBagsState(value);
            await ensureData();
            broadcastBags();
        }
    });
    client.port?.postMessage({type: 'GET_STORAGE', key: STORAGE_KEY});
    client.on('requestHerbCounts', () => requestBagsIfNeeded());

    let preUseCommands: string[] = [];
    let postUseCommands: string[] = [];
    client.on('settings', (settings) => {
        const st = (settings ?? {}) as { herbPreUseCommand?: string; herbPostUseCommand?: string };
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
                }).finally(() => {
                    loading = null;
                });
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
    ): AnsiAwareBuffer {
        const totalsMap: Record<string, number> = {};
        Object.values(bags).forEach(bag => {
            const contents = bag?.herbs ?? {};
            Object.entries(contents).forEach(([id, c]) => {
                totalsMap[id] = (totalsMap[id] || 0) + c;
            });
        });
        const entries = Object.entries(totalsMap);
        if (entries.length === 0) {
            const buffer = new AnsiAwareBuffer();
            buffer.append('Brak ziol.', {});
            buffer.color([0, buffer.length], WHITE);
            return buffer;
        }

        const output = new AnsiAwareBuffer();
        const normal = width >= 63;

        if (normal) {
            const separator = '------+--------------------+-------------------------------';
            output.append(separator, {});
            output.color([0, output.length], WHITE);
            output.append('\n');

            const headerLine = new AnsiAwareBuffer();
            headerLine.append('  ');
            headerLine.appendBuffer(colorString('ile', headerColor));
            headerLine.append(' |        ');
            headerLine.appendBuffer(colorString('nazwa', headerColor));
            headerLine.append('       |            ');
            headerLine.appendBuffer(colorString('dzialanie', headerColor));
            headerLine.append('             ');
            headerLine.color([0, headerLine.length], WHITE);
            output.appendBuffer(headerLine);
            output.append('\n');

            output.append(separator, {});
            output.color([output.length - separator.length, output.length], WHITE);
            output.append('\n');
        }

        const prefixWidth = normal ? 28 : 0;

        entries.sort((a, b) => a[0].localeCompare(b[0])).forEach(([id, c]) => {
            // Build uses as AnsiAwareBuffer to preserve mudlet colors
            const usesBuffer = new AnsiAwareBuffer();
            const usesList = herbs?.herb_id_to_use[id];
            if (usesList && usesList.length > 0) {
                usesList.forEach((u, idx) => {
                    if (idx > 0) usesBuffer.append(' | ');
                    usesBuffer.append(`${u.action}: `);
                    usesBuffer.appendBuffer(mudletColorLine(u.effect));
                });
            } else {
                usesBuffer.append('--');
            }
            const uses = usesBuffer.text; // For length calculations
            const herbName = useFormattedNames ? formatHerbName(id, c) : id;

            if (normal) {
                const base = `${String(c).padStart(5, ' ')} | ${herbName.padEnd(18, ' ')} | `;
                const available = width - base.length;

                const line = new AnsiAwareBuffer();
                line.append(base, WHITE);

                // Create link for herb name
                const nameStart = 8; // After count and " | "
                line.createLink([nameStart, nameStart + herbName.length], {
                    onContextMenu: (ev) => {
                        ev.preventDefault();
                        showHerbActions(id, ev);
                    },
                    title: `Prawy klik dla opcji: ${id}`
                });

                if (available >= uses.length) {
                    line.appendBuffer(usesBuffer);
                    output.appendBuffer(line);
                    output.append('\n');
                } else if (available > 0) {
                    // Split uses text but keep first part
                    const usesText = uses.slice(0, available);
                    line.append(usesText, WHITE);
                    output.appendBuffer(line);
                    output.append('\n');

                    const continueLine = new AnsiAwareBuffer();
                    continueLine.append(' '.repeat(base.length), WHITE);
                    // For continuation, we need to rebuild from the remaining text
                    const remainingText = uses.slice(available);
                    continueLine.append(remainingText, WHITE);
                    output.appendBuffer(continueLine);
                    output.append('\n');
                } else {
                    // Narrow: name on one line, uses on next
                    const shortLine = new AnsiAwareBuffer();
                    shortLine.append(`${String(c).padStart(5, ' ')} | ${herbName}`, WHITE);

                    // Create link for herb name
                    const nameStartElse = 8; // After count and " | "
                    shortLine.createLink([nameStartElse, nameStartElse + herbName.length], {
                        onContextMenu: (ev) => {
                            ev.preventDefault();
                            showHerbActions(id, ev);
                        },
                        title: `Prawy klik dla opcji: ${id}`
                    });

                    output.appendBuffer(shortLine);
                    output.append('\n');

                    const useLine = new AnsiAwareBuffer();
                    useLine.append(' '.repeat(prefixWidth), WHITE);
                    useLine.appendBuffer(usesBuffer);
                    output.appendBuffer(useLine);
                    output.append('\n');
                }
            } else {
                const line = new AnsiAwareBuffer();
                line.append(`${String(c).padStart(3, ' ')} ${herbName}`, WHITE);

                // Create link for herb name in narrow view
                const nameStartNarrow = 4; // After count and space
                line.createLink([nameStartNarrow, nameStartNarrow + herbName.length], {
                    onContextMenu: (ev) => {
                        ev.preventDefault();
                        showHerbActions(id, ev);
                    },
                    title: `Prawy klik dla opcji: ${id}`
                });

                output.appendBuffer(line);
                output.append('\n');

                const useLine = new AnsiAwareBuffer();
                useLine.append(' '.repeat(4), WHITE);
                useLine.appendBuffer(usesBuffer);
                output.appendBuffer(useLine);
                output.append('\n');
            }
        });

        if (normal) {
            const separator = '-----------------------------------------------------------';
            output.append(separator, {});
            output.color([output.length - separator.length, output.length], WHITE);
            output.append('\n');
        }

        if (includeBags && Object.keys(bags).length > 0) {
            output.append('\n');
            Object.entries(bags).forEach(([num, bagState]) => {
                const contents = bagState?.herbs ?? {};
                const herbEntries = Object.entries(contents)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([id, c]) => {
                        const name = useFormattedNames ? formatHerbName(id, c) : id;
                        return { id, count: c, name };
                    });

                const parts = herbEntries.map(e => `${e.count} ${e.name}`).join(', ');
                const condition = bagState?.condition;
                const conditionSuffix = typeof condition === 'number' ? ` [${condition}/5]` : '';

                const bagLine = new AnsiAwareBuffer();
                const bagPrefix = `${num}. `;
                bagLine.append(`${bagPrefix}${parts || '(pusty)'}${conditionSuffix}`, WHITE);

                // Create links for each herb name in the bag
                if (herbEntries.length > 0) {
                    let searchPos = bagPrefix.length;
                    herbEntries.forEach((entry, idx) => {
                        const herbText = `${entry.count} ${entry.name}`;
                        const nameStart = searchPos + entry.count.toString().length + 1; // After count and space
                        bagLine.createLink([nameStart, nameStart + entry.name.length], {
                            onContextMenu: (ev) => {
                                ev.preventDefault();
                                showHerbActions(entry.id, ev);
                            },
                            title: `Prawy klik dla opcji: ${entry.id}`
                        });
                        searchPos += herbText.length + (idx < herbEntries.length - 1 ? 2 : 0); // +2 for ", "
                    });
                }

                output.appendBuffer(bagLine);
                output.append('\n');
            });
        }

        return output;
    }

    function finish() {
        storedBags = normalizeHerbBagsState(structuredClone(bagTotals));
        const output = buildSummary(storedBags, true, false);
        client.print(output);
        persistBags();
        awaiting = false;
        left = 0;
        Object.keys(totals).forEach(k => delete totals[k]);
        currentBag = 0;
        Object.keys(bagTotals).forEach(k => delete bagTotals[parseInt(k)]);
    }

    client.Triggers.registerTrigger(countRegex, (line, matches) => {
        if (!awaiting) return line;
        left = parseNumber(matches.groups?.num || matches[1]);
        for (let i = 1; i <= left; i++) {
            client.sendCommand(`zajrzyj do ${i}. swojego woreczka`);
        }
        return line;
    });

    function extractHerbs(matches: RegExpMatchArray) {
        if (!awaiting) return
        currentBag += 1;
        const items = parseItems(matches.groups?.content || '');
        const bag: Record<string, number> = {};
        items.forEach(it => {
            const key = herbMap[it.name.toLowerCase()] || it.name.toLowerCase();
            const count = typeof it.count === 'number' ? it.count : parseNumber(String(it.count));
            totals[key] = (totals[key] || 0) + count;
            bag[key] = (bag[key] || 0) + count;
        });
        bagTotals[currentBag] = {herbs: bag};
        left -= 1;
        if (left <= 0) finish();
    }

    client.Triggers.registerTrigger(contentRegex1, (line, matches) => {
        extractHerbs(matches);
        return line
    });

    client.Triggers.registerTrigger(contentRegex2, (line, matches) => {
        extractHerbs(matches);
        return line
    });

    client.Triggers.registerTrigger(emptyRegex, (triggerLine) => {
        if (!awaiting) return triggerLine;
        currentBag += 1;
        bagTotals[currentBag] = {herbs: {}};
        left -= 1;
        if (left <= 0) finish();
        return triggerLine;
    });

    client.Triggers.registerTrigger(bagConditionRegex, (line, matches) => {
        const desc = matches?.groups?.desc;
        if (!desc) return line;
        const bagNumber = currentBagForEvaluation++
        if (!Number.isFinite(bagNumber) || bagNumber <= 0) return line;
        const wearValue = resolveWearValue(desc);
        if (wearValue == null) return line;
        pendingConditions[bagNumber] = wearValue;
        scheduleConditionFlush();
        return line;
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
        const {herbId, amount, fromBag, toBag} = options;
        if (!herbId || fromBag === toBag) {
            return;
        }
        const taken = await take(herbId, amount, fromBag);
        if (taken > 0) {
            await put(herbId, taken, toBag);
        }
    }

    client.herbManager = {
        getBags: cloneBags,
        take,
        put,
        move,
    };

    if (aliases) {
        aliases.push({pattern: /\/ziola_buduj$/, callback: start});
        aliases.push({pattern: /\/woreczki_buduj$/, callback: evaluateBagConditions});
        aliases.push({
            pattern: /\/ziola_pokaz$/, callback: () => {
                let unsubscribe: (() => void) | undefined;
                // eslint-disable-next-line prefer-const -- Forward reference: unsubscribe used in its own initializer
                unsubscribe = client.on('storage', async ({key, value}) => {
                    if (key === STORAGE_KEY) {
                        const bags = normalizeHerbBagsState(value);
                        await ensureData();
                        const output = buildSummary(bags, false, false);
                        if (output.length > 0) {
                            client.print(output);
                        } else {
                            client.println('Brak podsumowania.');
                        }
                        unsubscribe?.();
                    }
                });
                client.port?.postMessage({type: 'GET_STORAGE', key: STORAGE_KEY});
            }
        });
        aliases.push({
            pattern: /\/ziola$/, callback: () => {
                client.sendEvent('herbManagerOpen');
            }
        });
        aliases.push({
            pattern: /^\/wezz ([a-z_]+) ([0-9]+)$/,
            callback: (m: RegExpMatchArray) => take(m[1].toLowerCase(), parseInt(m[2], 10))
        });
        aliases.push({
            pattern: /^\/wezz ([a-zA-Z_]+)$/,
            callback: (m: RegExpMatchArray) => take(m[1].toLowerCase(), 1)
        });
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
                const biernik = getHerbCase(herb, amount, herbs);
                preUseCommands.forEach(cmd => client.sendCommand(cmd));
                client.sendCommand(`${action} ${amount} ${biernik}`);
                postUseCommands.forEach(cmd => client.sendCommand(cmd));
            }
        });
    }

    // load herb data in background so it's ready after refresh
    ensureData().catch(() => {
    });
}
