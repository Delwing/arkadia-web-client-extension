import Client from "../Client";
import {parseItems} from "./prettyContainers";
import loadHerbs, {HerbsData, isHerbSmokable} from "./herbsLoader";
import {colorString, createColorFormat, mudletColorLine} from "@modules/core/Colors";
import {openHerbContextMenu} from "@modules/core/contextMenus";
import type {HerbManagerApi, HerbMoveOptions, HerbBagsState, HerbBagState} from "../types/herbs";
import {clampHerbBagCondition, normalizeHerbBagsState} from "../types/herbs";
import {registerHerbManagerProvider} from "@modules/core/herbManagerProvider";
import {getWearValue} from "./wearUsed";
import {AnsiAwareBuffer} from "../ansi/FormatState";
import { polishWordToNumber } from "./polishNumberConverter";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";
import { getUiPort } from "@client/ports";

const headerColor = createColorFormat('#8470ff')
const WHITE = createColorFormat('#ffffff');
const STORAGE_KEY = "herb_counts";

// Smokable-herb marker: an SVG pipe (see `.herb-smoke-glyph` in style.css).
// Spaces carry the class; their count matches the glyph's 2ch render width.
const SMOKE_GLYPH_CLASS = 'herb-smoke-glyph';
const SMOKE_GLYPH_TEXT = '  ';

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
        characterStorage.set(STORAGE_KEY, snapshot);
        client.sendEvent('herbCounts', structuredClone(snapshot));
        storedBags = snapshot;
    };

    const broadcastBags = () => {
        client.sendEvent('herbCounts', structuredClone(storedBags));
    };

    const requestBagsIfNeeded = () => {
        if (Object.keys(storedBags).length === 0) {
            const stored = characterStorage.get(STORAGE_KEY);
            if (stored) {
                storedBags = normalizeHerbBagsState(stored);
            }
        }
        broadcastBags();
    };

    const initialHerbs = characterStorage.get(STORAGE_KEY);
    if (initialHerbs) {
        storedBags = normalizeHerbBagsState(initialHerbs);
    }

    characterStorage.onChange(STORAGE_KEY, async (newValue) => {
        storedBags = newValue ? normalizeHerbBagsState(newValue) : {};
        await ensureData();
        broadcastBags();
    });
    client.on('requestHerbCounts', () => requestBagsIfNeeded());

    let preUseCommands: string[] = [];
    let postUseCommands: string[] = [];
    let wieleCount = 25;
    const applyHerbSettings = (settings: any) => {
        const st = (settings ?? defaultSettings) as { herbPreUseCommand?: string; herbPostUseCommand?: string; herbWieleCount?: number };
        preUseCommands = typeof st.herbPreUseCommand === 'string'
            ? st.herbPreUseCommand.split(';').map((c: string) => c.trim()).filter(Boolean)
            : [];
        postUseCommands = typeof st.herbPostUseCommand === 'string'
            ? st.herbPostUseCommand.split(';').map((c: string) => c.trim()).filter(Boolean)
            : [];
        wieleCount = typeof st.herbWieleCount === 'number' && st.herbWieleCount > 0 ? st.herbWieleCount : 25;
    };
    applyHerbSettings(characterStorage.get('settings'));
    characterStorage.onChange('settings', applyHerbSettings);

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
    const emptyRegex2 = /^[> ]*Uwaznie ogladasz zawartosc[a-zA-Z -]*woreczka[a-z ]*\. W jego srodku nic jednak nie ma\.$/;
    // Detects start of woreczek evaluation (to filter out plecak etc.)
    const woreczekEvalStartRegex = /^Oceniasz starannie[^.]*woreczek/i;
    const bagConditionRegex = /^Ten element ekwipunku wyglada na (?<desc>.+)$/i;

    let awaiting = false;
    let left = 0;
    const totals: Record<string, number> = {};
    const bagTotals: Record<number, HerbBagState> = {};
    const pendingConditions: Record<number, number> = {};
    let conditionFlushHandle: ReturnType<typeof setTimeout> | null = null;
    let evaluatingWoreczkiCondition = false;
    let lastEvaluatedWasWoreczek = false;

    const scheduleConditionFlush = () => {
        if (conditionFlushHandle) return;
        conditionFlushHandle = setTimeout(() => {
            conditionFlushHandle = null;
            evaluatingWoreczkiCondition = false;
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
        openHerbContextMenu({
            herbId: id,
            actions: herbs?.herb_id_to_use[id],
            x: ev.pageX,
            y: ev.pageY,
            commandPrefix: '/zi',
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

        // Pre-calculate max widths for dynamic separators
        const countWidth = 5;
        let maxNameWidth = 5; // minimum "nazwa".length
        let maxActionsWidth = 9; // minimum "dzialanie".length

        const sortedEntries = entries.sort((a, b) => a[0].localeCompare(b[0]));

        // First pass: calculate max widths
        const rowData: Array<{id: string, count: number, herbName: string, usesText: string, usesBuffer: AnsiAwareBuffer, smokable: boolean}> = [];
        sortedEntries.forEach(([id, c]) => {
            const usesBuffer = new AnsiAwareBuffer();
            // Smokable entries carry no real action — exclude them here; they
            // are summarised in the "Do palenia" section at the bottom.
            const usesList = (herbs?.herb_id_to_use[id] ?? []).filter(u => !u.smokable);
            if (usesList.length > 0) {
                usesList.forEach((u, idx) => {
                    if (idx > 0) usesBuffer.append(' | ');
                    usesBuffer.append(`${u.action}: `);
                    usesBuffer.appendBuffer(mudletColorLine(u.effect));
                });
            } else {
                usesBuffer.append('--');
            }
            const herbName = useFormattedNames ? formatHerbName(id, c) : id;
            const usesText = usesBuffer.text;
            const smokable = isHerbSmokable(herbs?.herb_id_to_use[id]);

            // Smokable names are included in the column widths so the "Do palenia"
            // rows align exactly like the regular rows above.
            maxNameWidth = Math.max(maxNameWidth, herbName.length);
            maxActionsWidth = Math.max(maxActionsWidth, usesText.length);

            rowData.push({id, count: c, herbName, usesText, usesBuffer, smokable});
        });

        // Build dynamic separator
        const sepCount = '-'.repeat(countWidth + 1);
        const sepName = '-'.repeat(maxNameWidth + 2);
        const sepActions = '-'.repeat(maxActionsWidth + 2);
        const separator = `${sepCount}+${sepName}+${sepActions}`;

        if (normal) {
            output.append(separator, {});
            output.color([0, output.length], WHITE);
            output.append('\n');

            // Build header with centered column names
            const headerLine = new AnsiAwareBuffer();
            headerLine.append('  ');
            headerLine.appendBuffer(colorString('ile', headerColor));
            headerLine.append(' | ');

            const namePadLeft = Math.floor((maxNameWidth - 5) / 2);
            const namePadRight = maxNameWidth - 5 - namePadLeft;
            headerLine.append(' '.repeat(namePadLeft));
            headerLine.appendBuffer(colorString('nazwa', headerColor));
            headerLine.append(' '.repeat(namePadRight));

            headerLine.append(' | ');

            const actionsPadLeft = Math.floor((maxActionsWidth - 9) / 2);
            headerLine.append(' '.repeat(actionsPadLeft));
            headerLine.appendBuffer(colorString('dzialanie', headerColor));

            headerLine.color([0, headerLine.length], WHITE);
            output.appendBuffer(headerLine);
            output.append('\n');

            const sepStart = output.length;
            output.append(separator, {});
            output.color([sepStart, output.length], WHITE);
            output.append('\n');
        }

        // Second pass: build rows (smokable herbs are listed separately below)
        rowData.forEach(({id, count, herbName, usesBuffer, smokable}) => {
            if (smokable) return;
            if (normal) {
                const line = new AnsiAwareBuffer();
                const base = `${String(count).padStart(countWidth, ' ')} | ${herbName.padEnd(maxNameWidth, ' ')} | `;
                line.append(base, WHITE);

                // Create link for herb name
                const nameStart = countWidth + 3; // After count and " | "
                line.createLink([nameStart, nameStart + herbName.length], {
                    onContextMenu: (ev) => {
                        ev.preventDefault();
                        showHerbActions(id, ev);
                    },
                    onMouseEnter: (ev) => {
                        getUiPort().showHerbTooltip(id, herbs?.herb_id_to_use[id], ev.pageX, ev.pageY);
                    },
                    onMouseLeave: () => {
                        getUiPort().hideHerbTooltip();
                    },
                });

                line.appendBuffer(usesBuffer);
                output.appendBuffer(line);
                output.append('\n');
            } else {
                const line = new AnsiAwareBuffer();
                line.append(`${String(count).padStart(3, ' ')} ${herbName}`, WHITE);

                // Create link for herb name in narrow view
                const nameStartNarrow = 4; // After count and space
                line.createLink([nameStartNarrow, nameStartNarrow + herbName.length], {
                    onContextMenu: (ev) => {
                        ev.preventDefault();
                        showHerbActions(id, ev);
                    },
                    onMouseEnter: (ev) => {
                        getUiPort().showHerbTooltip(id, herbs?.herb_id_to_use[id], ev.pageX, ev.pageY);
                    },
                    onMouseLeave: () => {
                        getUiPort().hideHerbTooltip();
                    },
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
            const footerStart = output.length;
            output.append(separator, {});
            output.color([footerStart, output.length], WHITE);
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

        // Smokable herbs, listed at the bottom one per line with the pipe glyph.
        const smokableRows = rowData.filter(({smokable}) => smokable);
        if (smokableRows.length > 0) {
            // In the narrow view the full table separator would overflow, so cap it.
            const sepLine = normal ? separator : '-'.repeat(Math.min(width, Math.max(maxNameWidth + 6, 10)));
            const sepStart = output.length;
            output.append(sepLine, {});
            output.color([sepStart, output.length], WHITE);
            output.append('\n');

            const labelStart = output.length;
            output.append('Do palenia:', {});
            output.color([labelStart, output.length], WHITE);
            output.append('\n');

            // Formatted like a normal row, with the pipe glyph in the action
            // column. A trailing space after the glyph makes the line end in plain
            // text so the newline breaks it (a newline straight after the
            // inline-block glyph span does not).
            smokableRows.forEach(({id, count, herbName}) => {
                const line = new AnsiAwareBuffer();
                const nameStart = normal ? countWidth + 3 : 4;
                if (normal) {
                    line.append(`${String(count).padStart(countWidth, ' ')} | ${herbName.padEnd(maxNameWidth, ' ')} | `, WHITE);
                } else {
                    line.append(`${String(count).padStart(3, ' ')} ${herbName} `, WHITE);
                }
                // Right-click the name to reach the "Nabij fajke" action.
                line.createLink([nameStart, nameStart + herbName.length], {
                    onContextMenu: (ev) => {
                        ev.preventDefault();
                        showHerbActions(id, ev);
                    },
                });
                line.append(SMOKE_GLYPH_TEXT, { ...WHITE, cssClass: SMOKE_GLYPH_CLASS });
                line.append(' ', WHITE);
                output.appendBuffer(line);
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
        left = polishWordToNumber(matches.groups?.num || matches[1]);
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
            let count: number;
            if (typeof it.count === 'number') {
                count = it.count;
            } else if (it.count === 'wie') {
                count = wieleCount;
            } else {
                count = polishWordToNumber(String(it.count));
            }
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

    function handleEmptyBag(triggerLine: AnsiAwareBuffer) {
        if (!awaiting) return triggerLine;
        currentBag += 1;
        bagTotals[currentBag] = {herbs: {}};
        left -= 1;
        if (left <= 0) finish();
        return triggerLine;
    }

    client.Triggers.registerTrigger(emptyRegex, handleEmptyBag);
    client.Triggers.registerTrigger(emptyRegex2, handleEmptyBag);

    // Track when a woreczek evaluation starts (only during /woreczki_buduj)
    client.Triggers.registerTrigger(woreczekEvalStartRegex, (line) => {
        if (evaluatingWoreczkiCondition) {
            lastEvaluatedWasWoreczek = true;
        }
        return line;
    });

    // Only count condition if it follows a woreczek evaluation
    client.Triggers.registerTrigger(bagConditionRegex, (line, matches) => {
        if (!lastEvaluatedWasWoreczek) return line;
        lastEvaluatedWasWoreczek = false;
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
        evaluatingWoreczkiCondition = true;
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
            client.sendCommand(`wez ${toTake} ${form} z ${num}. swojego woreczka`);
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

    const herbManagerApi: HerbManagerApi = {
        getBags: cloneBags,
        take,
        put,
        move,
    };
    client.herbManager = herbManagerApi;
    registerHerbManagerProvider(herbManagerApi);

    if (aliases) {
        aliases.push({pattern: /\/ziola_buduj$/, callback: start});
        aliases.push({pattern: /\/woreczki_buduj$/, callback: evaluateBagConditions});
        aliases.push({
            pattern: /\/ziola_pokaz$/, callback: async () => {
                const stored = characterStorage.get(STORAGE_KEY);
                const bags = normalizeHerbBagsState(stored);
                await ensureData();
                const output = buildSummary(bags, false, false);
                if (output.length > 0) {
                    client.print(output);
                } else {
                    client.println('Brak podsumowania.');
                }
            }
        });
        aliases.push({
            pattern: /\/ziola$/, callback: () => {
                client.sendEvent('herbManagerOpen');
            }
        });
        aliases.push({
            pattern: /\/ziola2$/, callback: () => {
                client.sendEvent('herbTextWindowOpen');
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
        const useHerb = async (m: RegExpMatchArray) => {
            const action = m[1];
            const herb = m[2].toLowerCase();
            preUseCommands.forEach(cmd => client.sendCommand(cmd));
            await take(herb, 1);
            const biernik = herbs?.herb_id_to_odmiana[herb]?.biernik || herb;
            client.sendCommand(`${action} ${biernik}`);
            postUseCommands.forEach(cmd => client.sendCommand(cmd));
        };

        const useHerbAmount = async (m: RegExpMatchArray) => {
            const action = m[1];
            const herb = m[2].toLowerCase();
            let amount = polishWordToNumber(m[3]);
            if (isNaN(amount)) {
                amount = 1;
            }
            preUseCommands.forEach(cmd => client.sendCommand(cmd));
            await take(herb, amount);
            const biernik = getHerbCase(herb, amount, herbs);
            client.sendCommand(`${action} ${amount} ${biernik}`);
            postUseCommands.forEach(cmd => client.sendCommand(cmd));
        };

        aliases.push({pattern: /^\/zi (\w+) (\w+)$/, callback: useHerb});
        aliases.push({pattern: /^\/zi (\w+) (\w+) (\d+)$/, callback: useHerbAmount});
        aliases.push({pattern: /^\/z_(?!id\b)(\w+) (\w+)$/, callback: useHerb});
        aliases.push({pattern: /^\/z_(?!id\b)(\w+) (\w+) (\d+)$/, callback: useHerbAmount});

        aliases.push({
            pattern: /^\/ziola_przepakuj ([0-9]+) ([0-9]+)$/,
            callback: (m: RegExpMatchArray) => {
                const from = m[1];
                const to = m[2];
                if (from === to) {
                    client.println('Woreczek zrodlowy i docelowy sa takie same.');
                    return;
                }
                client.sendCommand(`otworz ${from}. swoj woreczek`);
                client.sendCommand(`wez ziola z ${from}. swojego woreczka`);
                client.sendCommand(`otworz ${to}. swoj woreczek`);
                client.sendCommand(`wloz ziola do ${to}. swojego woreczka`);
                client.sendCommand(`otworz ${from}. swoj woreczek`);
                client.sendCommand(`wloz ziola do ${from}. swojego woreczka`);
                client.sendCommand('zamknij otwarte woreczki');
            }
        });

        const findByShortcut = (short: string) => {
            const lower = short.toLowerCase();
            return client.ObjectManager
                .getObjectsOnLocation()
                .find(o => o.shortcut?.toLowerCase() === lower);
        };

        const giveHerb = async (who: string, herb: string, count: number) => {
            if (count <= 0) {
                client.println('Ilosc musi byc wieksza od zera.');
                return;
            }
            await ensureData();
            if (herbs && !herbs.herb_id_to_odmiana[herb]) {
                client.println(`Nieznane ziolo: ${herb}`);
                return;
            }
            // Accept either a letter/number shortcut (as in /z, /zas) or a name.
            const objectId = findByShortcut(who)?.num
                ?? client.TeamManager.getTeamMemberObjectId(who);
            if (objectId === undefined) {
                client.println(`Nie znaleziono celu: ${who}`);
                return;
            }
            const taken = await take(herb, count);
            if (taken === 0) {
                client.println(`Brak ziola: ${herb}`);
                return;
            }
            client.sendCommand(`daj ziola ob_${objectId}`);
        };

        aliases.push({
            pattern: /^\/ziola_daj ([A-Za-z0-9@]+) ([a-z_]+) ([0-9]+)$/,
            callback: (m: RegExpMatchArray) =>
                giveHerb(m[1], m[2].toLowerCase(), parseInt(m[3], 10))
        });

        aliases.push({
            pattern: /^\/ziola_daj ([A-Za-z0-9@]+) ([a-z_]+)$/,
            callback: (m: RegExpMatchArray) =>
                giveHerb(m[1], m[2].toLowerCase(), 1)
        });

        let pendingPutDown: { bag: number; time: number } | null = null;
        aliases.push({
            pattern: /^\/ziola_odloz_woreczek ([0-9]+)$/,
            callback: (m: RegExpMatchArray) => {
                const bagNum = parseInt(m[1], 10);
                const bag = storedBags[bagNum];
                const hasHerbs = bag && Object.values(bag.herbs ?? {}).some(c => c > 0);
                if (hasHerbs) {
                    const now = Date.now();
                    if (pendingPutDown && pendingPutDown.bag === bagNum && now - pendingPutDown.time < 10000) {
                        pendingPutDown = null;
                    } else {
                        pendingPutDown = {bag: bagNum, time: now};
                        client.println(`Woreczek ${bagNum} zawiera ziola. Powtorz komende aby potwierdzic.`);
                        return;
                    }
                }
                client.sendCommand(`odbezpiecz ${bagNum}. swoj woreczek`);
                client.sendCommand(`odtrocz ${bagNum}. swoj woreczek`);
                client.sendCommand(`odloz ${bagNum}. swoj woreczek`);
                if (storedBags[bagNum]) {
                    delete storedBags[bagNum];
                    persistBags();
                }
            }
        });
    }

    // load herb data in background so it's ready after refresh
    ensureData().catch(() => {
    });
}
