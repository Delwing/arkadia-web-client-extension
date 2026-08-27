import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";
import {characterStorage} from "@modules/core/storage";
import {getFromIndexedDB, storeInIndexedDB, IndexedDBConfig} from "@client/utils/dataCache.ts";
import {GOLD_COLOR, SILVER_COLOR, COPPER_COLOR} from "../constants/colors";
import {createPad, createHeader} from "./counterTableUtils";

export interface DeliveryRecord {
    timestamp: number;
    late: boolean;
    gold: number;
    silver: number;
    copper: number;
}

const HEADER_COLOR = createColorFormat("#7cfc00");
const LABEL_COLOR = createColorFormat("#ffff00");
const LATE_COLOR = createColorFormat("#ff6347");

const WIDTH = 48;

function getDbConfig(character: string): IndexedDBConfig {
    return {
        dbName: "ArkadiaDeliveryStats",
        storeName: "deliveries",
        key: character,
    };
}

function parsePayment(text: string): { gold: number; silver: number; copper: number } {
    const gold = text.match(/(\d+) zlo/);
    const silver = text.match(/(\d+) sre/);
    const copper = text.match(/(\d+) mie/);
    return {
        gold: gold ? parseInt(gold[1], 10) : 0,
        silver: silver ? parseInt(silver[1], 10) : 0,
        copper: copper ? parseInt(copper[1], 10) : 0,
    };
}


interface PeriodStats {
    total: number;
    late: number;
    gold: number;
    silver: number;
    copper: number;
}

function computeStats(records: DeliveryRecord[], since?: number): PeriodStats {
    const filtered = since ? records.filter(r => r.timestamp >= since) : records;
    return filtered.reduce<PeriodStats>(
        (acc, r) => {
            acc.total++;
            if (r.late) acc.late++;
            acc.gold += r.gold;
            acc.silver += r.silver;
            acc.copper += r.copper;
            return acc;
        },
        {total: 0, late: 0, gold: 0, silver: 0, copper: 0},
    );
}

function startOfDay(): number {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function startOfWeek(): number {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function startOfMonth(): number {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function formatEarnings(gold: number, silver: number, copper: number): AnsiAwareBuffer {
    const buffer = new AnsiAwareBuffer();
    let first = true;
    if (gold > 0) {
        buffer.append(`${gold}z`, GOLD_COLOR);
        first = false;
    }
    if (silver > 0) {
        if (!first) buffer.append(" ", {});
        buffer.append(`${silver}s`, SILVER_COLOR);
        first = false;
    }
    if (copper > 0 || first) {
        if (!first) buffer.append(" ", {});
        buffer.append(`${copper}m`, COPPER_COLOR);
    }
    return buffer;
}

function formatStatsTable(records: DeliveryRecord[]): AnsiAwareBuffer {
    const INNER = WIDTH - 2;
    const LEFT_PADDING = 2;
    const RIGHT_PADDING = 2;

    const pad = createPad(INNER, LEFT_PADDING, RIGHT_PADDING);
    const header = createHeader(WIDTH, 4, HEADER_COLOR);

    const periods: { label: string; since?: number }[] = [
        {label: "DZISIAJ", since: startOfDay()},
        {label: "OSTATNI TYDZIEN", since: startOfWeek()},
        {label: "OSTATNI MIESIAC", since: startOfMonth()},
        {label: "LACZNIE"},
    ];

    const output = new AnsiAwareBuffer();
    output.appendBuffer(header("Statystyki paczek"));
    output.append("\n", {});
    output.appendBuffer(pad());
    output.append("\n", {});

    for (const period of periods) {
        const stats = computeStats(records, period.since);

        const labelLine = new AnsiAwareBuffer();
        labelLine.append(period.label, LABEL_COLOR);
        output.appendBuffer(pad(labelLine));
        output.append("\n", {});

        const deliveredLine = new AnsiAwareBuffer();
        deliveredLine.append(`Dostarczono: ${stats.total}`, {});
        if (stats.late > 0) {
            deliveredLine.append(` (spoznione: `, {});
            deliveredLine.append(`${stats.late}`, LATE_COLOR);
            deliveredLine.append(`)`, {});
        }
        output.appendBuffer(pad(deliveredLine));
        output.append("\n", {});

        const earningsLine = new AnsiAwareBuffer();
        earningsLine.append("Zarobek: ", {});
        earningsLine.appendBuffer(formatEarnings(stats.gold, stats.silver, stats.copper));
        output.appendBuffer(pad(earningsLine));
        output.append("\n", {});

        output.appendBuffer(pad());
        output.append("\n", {});
    }

    output.append(`+${"-".repeat(INNER)}+`, {});
    return output;
}

export default function initDeliveryStats(
    client: Client,
    aliases: { pattern: RegExp; callback: Function }[],
) {
    let records: DeliveryRecord[] = [];
    let loaded = false;
    let currentConfig: IndexedDBConfig | null = null;

    let awaitingPayment = false;
    let isLate = false;
    let lateTrigger: ReturnType<typeof client.Triggers.registerOneTimeTrigger> | undefined;
    let paymentTrigger: ReturnType<typeof client.Triggers.registerOneTimeTrigger> | undefined;

    async function load() {
        const character = characterStorage.getCharacter();
        if (!character) return;
        currentConfig = getDbConfig(character);
        const data = await getFromIndexedDB<DeliveryRecord[]>(currentConfig).catch(() => null);
        records = Array.isArray(data) ? data : [];
        loaded = true;
    }

    async function save() {
        if (!currentConfig) return;
        await storeInIndexedDB(currentConfig, records).catch((e) =>
            console.error("Failed to save delivery stats:", e),
        );
    }

    function record(late: boolean, gold: number, silver: number, copper: number) {
        records.push({
            timestamp: client.now(),
            late,
            gold,
            silver,
            copper,
        });
        void save();
    }

    function cleanup() {
        awaitingPayment = false;
        isLate = false;
        if (lateTrigger) {
            client.Triggers.removeTrigger(lateTrigger);
            lateTrigger = undefined;
        }
        if (paymentTrigger) {
            client.Triggers.removeTrigger(paymentTrigger);
            paymentTrigger = undefined;
        }
    }

    function showStats() {
        const output = new AnsiAwareBuffer();
        output.append("\n", {});
        output.appendBuffer(formatStatsTable(records));
        output.append("\n", {});
        client.print(output);
    }

    client.on('gmcp.char.info', () => {
        void load();
    });

    client.Triggers.registerTrigger(
        /^(Oddajesz|Zwracasz) pocztowa paczke/,
        (line, matches) => {
            if (matches && matches[1] === "Oddajesz") {
                cleanup();
                awaitingPayment = true;
                isLate = false;

                lateTrigger = client.Triggers.registerOneTimeTrigger(
                    /po terminie/,
                    (lateLine) => {
                        isLate = true;
                        lateTrigger = undefined;
                        return lateLine;
                    },
                );

                paymentTrigger = client.Triggers.registerOneTimeTrigger(
                    /wyplaca ci (.+) monet/,
                    (payLine, payMatches) => {
                        if (awaitingPayment && payMatches) {
                            const {gold, silver, copper} = parsePayment(payMatches[1]);
                            record(isLate, gold, silver, copper);
                        }
                        if (lateTrigger) {
                            client.Triggers.removeTrigger(lateTrigger);
                            lateTrigger = undefined;
                        }
                        awaitingPayment = false;
                        isLate = false;
                        paymentTrigger = undefined;
                        return payLine;
                    },
                );
            }
            return line;
        },
    );

    aliases.push({
        pattern: /^\/paczki$/,
        callback: () => {
            if (!loaded) {
                void load().then(() => showStats());
            } else {
                showStats();
            }
        },
    });
}
