import { addLocalNpc } from "@web/dataStores/npcStore";
import {colorStringInLine, findClosestColor, RESET} from "@modules/core/Colors";
import Client from "./Client";
import { Trigger } from "./Triggers";
import toTitleCase from "./utils/toTitleCase";

const tag = "packageHelper";
const pickCommand = "wybierz paczke"
const packageLineRegex = /^ \|\s*(?<heavy>\*)?\s*(?<number>\d+)\. (?<name>.*?)(?:, (?<city>[\w' ]+?))?\s+(?<gold>\d+)\/\s?(?<silver>\d+)\/\s?(?<copper>\d+)\s+(?:nieogr\.|(?<time>\d+))/
const packageTableRegex = /Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:[\s\S]*?Symbolem \* oznaczono przesylki ciezkie\./
const shortInfo = RESET + 'Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:\n'
const STANDARD_DISTANCE_COLUMN_WIDTH = 16;

type PackageLineInfo = {
    index: string;
    heavy: boolean;
    name: string;
    city?: string;
    gold: string;
    silver: string;
    copper: string;
    time?: string;
    distance?: number;
}

const pickFailMessages = [
    'Nie ufam ci na tyle, aby powierzyc ci dostarczenie tej przesylki.',
    'Lista przesylek zmienila sie i ta, ktora chcesz podjac byc moze nie jest juz ta, ktora widziales w spisie. Sprawdz spis ponownie, badz sprobuj podjac paczke jeszcze raz, jesli mimo to chcesz ja dostarczyc.',
    'Ty juz dla nas dostatecznie ciezko zapracowales',
    'Cos ci sie chyba pomylilo, nie ma takiej oferty',
    'Niestety, nie widzisz tu nikogo, od kogo mozna by wziac zlecenie',
]

const KNOWN_NPC_COLOR = findClosestColor('#63ba41');
const UNKNOWN_NPC_COLOR = findClosestColor('#aaaaaa');

export default function initPackageHelper(client: Client) {
    const npc: Record<string, number> = {};
    let enabled = false;

    let packages: { name: string; time?: string; distance?: number }[] = [];
    let listTime = 0;
    let timer: number | undefined;
    let remover = () => {};
    let locationListener: ((payload: { id?: number }) => void) | undefined;
    let locationSubscription: (() => void) | undefined;

    let pick: number;
    let currentPackage: { name: string; time?: string; distance?: number } | undefined;

    let deliveryTrigger: Trigger | undefined;
    let pickTrigger: Trigger | undefined;
    let failTrigger: Trigger | undefined;

    client.on('npc', (data) => {
        const list = Array.isArray(data) ? data : [];
        list.forEach((item: { name: string | number; loc: number; }) => npc[item.name] = item.loc)
    })

    client.on('settings', (event) => {
        const detail = (event ?? {}) as { packageHelper?: boolean };
        const setting = detail?.packageHelper
        const shouldEnable = setting === undefined ? true : setting
        if (!enabled && shouldEnable) {
            init()
        } else if (enabled && !shouldEnable) {
            disable()
        }
    })

    function init() {
        enabled = true;
        client.Triggers.registerTrigger(/^Wypisano na niej duzymi literami: ([a-zA-Z ']+).*$/, (triggerLine) => {
            const matches = triggerLine.matches.matches;
            if (!matches) return triggerLine;
            const name = toTitleCase(matches[1])
            leadToPackage(name)
            if (!currentPackage || currentPackage.name !== name) {
                currentPackage = { name }
            }
            client.sendEvent('packageStatus', { recipient: name })
            if (!deliveryTrigger) {
                registerDeliveryTrigger()
            }
            const colorCode = npc[name] ? KNOWN_NPC_COLOR : findClosestColor('#ffff00')
            return colorStringInLine(triggerLine, matches[1], colorCode)
        }, tag)
        client.Triggers.registerMultilineTrigger(packageTableRegex, packageTableCallback(), tag)
    }

    function onPackageList() {
        packages = []
        listTime = Date.now()
        if (timer) {
            clearInterval(timer)
            timer = undefined
            client.sendEvent('packageStatus', null)
        }
        remover();
        remover = client.on("command", (command = "") => handleCommand(command));
    }

    function handleCommand(command: string) {
        if (!command.startsWith(pickCommand)) {
            return;
        }
        pick = parseInt(command.substring(pickCommand.length + 1).trim())
        pickTrigger = client.Triggers.registerOneTimeTrigger(/^.* przekazuje ci jakas paczke\./, (triggerLine) => {
            if (failTrigger) {
                client.Triggers.removeTrigger(failTrigger)
                failTrigger = undefined
            }
            currentPackage = packages[pick - 1]
            leadToPackage(currentPackage.name)
            startTimer()
            registerDeliveryTrigger()
            return triggerLine;
        })
        failTrigger = client.Triggers.registerOneTimeTrigger(pickFailMessages, (triggerLine) => {
            if (pickTrigger) {
                client.Triggers.removeTrigger(pickTrigger)
                pickTrigger = undefined
            }
            return triggerLine;
        })
    }

    function packageLineCallback() {
        return (triggerLine: any) => {
            const matches = triggerLine.matches.matches;
            if (!matches) return triggerLine;
            const info = parsePackageLine(matches)
            const line = extendStandardDataLine(triggerLine.toAnsiString(), info)
            const colorCode = npc[info.name] ? KNOWN_NPC_COLOR : UNKNOWN_NPC_COLOR;
            const command = `${pickCommand} ${info.index}`
            const coloredLine = colorStringInLine(line, info.name, colorCode).toAnsiString()
            const clickable = client.OutputHandler.makeClickable(coloredLine, info.name, () => {
                client.sendCommand(command)
            }, command)
            triggerLine.setOverrideAnsi(clickable);
            return triggerLine;
        };
    }

    function isMobileBrowser() {
        return typeof navigator !== 'undefined' &&
            /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    function packageTableCallback() {
        const lineCallback = packageLineCallback();
        const widthLimit = 78;
        return (triggerLine: any) => {
            onPackageList();
            const lines = triggerLine.text.split('\n');
            const narrow = isMobileBrowser() ||
                (client.contentWidth && client.contentWidth < widthLimit);
            if (narrow) {
                const out = [shortInfo];
                lines.forEach(line => {
                    if (line.startsWith('Tablica zawiera liste')) {
                        return;
                    }
                    if (/^Symbolem \* oznaczono przesylki ciezkie\./.test(line)) {
                        return;
                    }
                    const matches = line.match(packageLineRegex);
                    if (!matches) {
                        return;
                    }
                    const info = parsePackageLine(matches);
                    const city = info.city ? `, ${info.city}` : '';
                    const heavy = info.heavy ? '* ' : '  ';
                    const first = RESET  + `${heavy}${info.index}. ${info.name}${city}`;
                    const colorCode = npc[info.name] ? KNOWN_NPC_COLOR : UNKNOWN_NPC_COLOR;
                    const coloredFirst = colorStringInLine(first, info.name, colorCode).toAnsiString();
                    const clickable = client.OutputHandler.makeClickable(
                        coloredFirst,
                        info.name,
                        () => {
                            client.sendCommand('wybierz paczke ' + info.index);
                        },
                        'wybierz paczke ' + info.index
                    ) + RESET   ;
                    const time = info.time ? info.time + ' godz.' : 'nieogr.';
                    const distanceText = info.distance !== undefined ? ` dystans: ${info.distance}` : ' dystans: --';
                    const second = `   ${info.gold}/${info.silver}/${info.copper} ${time}${distanceText}\n`;
                    out.push(clickable, second);
                });
                triggerLine.setOverrideAnsi(out.join('\n'));
                return triggerLine;
            }
            const processedLines = lines
                .map(line => {
                    const matches = line.match(packageLineRegex);
                    if (matches) {
                        const lineTrigger = new (triggerLine.constructor as any)(line, { matches });
                        const result = lineCallback(lineTrigger);
                        return result ? result.toAnsiString() : line;
                    }
                    if (isStandardTopOrBottomBorder(line)) {
                        return extendBorderLine(line, '=');
                    }
                    if (isStandardSeparator(line)) {
                        return extendBorderLine(line, '-');
                    }
                    if (isStandardHeaderLine(line)) {
                        return appendDistanceColumn(line, ' Dystans');
                    }
                    if (isStandardSubHeaderLine(line)) {
                        return appendDistanceColumn(line, ' w krokach');
                    }
                    if (isStandardFooterLine(line)) {
                        return appendDistanceColumn(line, '');
                    }
                    if (line.startsWith(' |')) {
                        return appendDistanceColumn(line, '');
                    }
                    return line;
                });
            triggerLine.setOverrideAnsi(processedLines.join('\n'));
            return triggerLine;
        };
    }

    function parsePackageLine(matches: RegExpMatchArray): PackageLineInfo {
        const name = matches.groups.name.trimEnd()
        const distance = getDistanceToNpc(name)
        const info: PackageLineInfo = {
            index: matches.groups.number,
            heavy: !!matches.groups.heavy,
            name,
            city: matches.groups.city?.trimEnd(),
            gold: matches.groups.gold,
            silver: matches.groups.silver,
            copper: matches.groups.copper,
            time: matches.groups.time,
            distance,
        }
        packages.push({ name, time: info.time, distance })
        return info
    }

    function extendStandardDataLine(rawLine: string, info: PackageLineInfo): string {
        const distanceValue = info.distance !== undefined ? `${info.distance}` : '--'
        return appendDistanceColumn(rawLine, ` dystans: ${distanceValue}`)
    }

    function appendDistanceColumn(line: string, content: string): string {
        const index = line.lastIndexOf('|')
        if (index === -1) {
            return line
        }
        const prefix = line.slice(0, index)
        const normalized = content
            ? (content.startsWith(' ') ? content : ` ${content}`)
            : ''
        const padded = padRight(normalized, STANDARD_DISTANCE_COLUMN_WIDTH)
        return `${prefix}${padded}|`
    }

    function extendBorderLine(line: string, fill: '=' | '-') {
        const first = line.indexOf(fill)
        const last = line.lastIndexOf(fill)
        if (first === -1 || last === -1) {
            return line
        }
        const repeat = last - first + 1 + STANDARD_DISTANCE_COLUMN_WIDTH
        return line.slice(0, first) + fill.repeat(repeat) + line.slice(last + 1)
    }

    function isStandardTopOrBottomBorder(line: string): boolean {
        const trimmed = line.trim()
        return trimmed.startsWith('o') && trimmed.endsWith('o') && trimmed.includes('=')
    }

    function isStandardSeparator(line: string): boolean {
        const trimmed = line.trim()
        return trimmed.startsWith('o') && trimmed.endsWith('o') && trimmed.includes('-')
    }

    function isStandardHeaderLine(line: string): boolean {
        return line.startsWith(' |') && line.includes('Adresat badz')
    }

    function isStandardSubHeaderLine(line: string): boolean {
        return line.startsWith(' |') && line.includes('urzad pocztowy')
    }

    function isStandardFooterLine(line: string): boolean {
        return line.startsWith(' |') && line.includes('Symbolem *')
    }

    function padRight(value: string, length: number): string {
        if (value.length >= length) {
            return value
        }
        return value + ' '.repeat(length - value.length)
    }

    function startTimer() {
        if (!currentPackage) {
            return
        }
        const hours = currentPackage.time ? parseInt(currentPackage.time as any) : null
        if (timer) {
            clearInterval(timer)
        }
        if (hours == null) {
            client.sendEvent('packageStatus', {recipient: currentPackage.name})
            timer = undefined
            return
        }
        const total = hours * 120
        const update = () => {
            const left = total - Math.floor((Date.now() - listTime) / 1000)
            client.sendEvent('packageStatus', {recipient: currentPackage!.name, seconds: left})
            if (left <= 0 && timer) {
                clearInterval(timer)
                timer = undefined
            }
        }
        update()
        timer = window.setInterval(update, 1000)
    }

    function stopTimer() {
        if (timer) {
            clearInterval(timer)
            timer = undefined
        }
        client.sendEvent('packageStatus', null)
    }

    function registerDeliveryTrigger() {
        deliveryTrigger = client.Triggers.registerOneTimeTrigger(/^(Oddajesz|Zwracasz) pocztowa paczke/, (triggerLine) => {
            const matches = triggerLine.matches.matches;
            if (matches && matches[1] === 'Oddajesz') {
                if (!npc[currentPackage!.name]) {
                    client.println(`Nowy adresat: ${currentPackage!.name} | ${client.Map.currentRoom.id}`)
                    void addLocalNpc({ name: currentPackage!.name, loc: client.Map.currentRoom.id })
                        .catch(err => console.error('Failed to add NPC:', err))
                }
            }
            currentPackage = undefined;
            stopTimer();
            deliveryTrigger = undefined;
            return triggerLine;
        })
    }

    function leadToPackage(name: string) {
        const location = findNpcLocation(name)
        if (location) {
            client.sendEvent('leadTo', location)
        }
        if (locationSubscription) {
            locationSubscription();
            locationSubscription = undefined;
        }
        locationListener = (payload) => {
            const roomId = payload?.id;
            if (roomId === location) {
                locationSubscription?.();
                locationSubscription = undefined;
                client.on('gmcp_msg.room.exits', () => {
                    client.FunctionalBind.set('oddaj paczke', () => client.sendCommand('oddaj paczke'));
                }, {once: true});
            }
        }
        locationSubscription = client.on('enterLocation', (detail) => {
            locationListener?.((detail ?? {}) as { id?: number });
        });
    }

    function findNpcLocation(name: string): number | undefined {
        let location = npc[name]
        if (!location) {
            const found = Object.entries(npc).find(([n]) => name.toLowerCase() === n.toLowerCase())
            if (found) {
                [, location] = found
            }
        }
        return location
    }

    function getDistanceToNpc(name: string): number | undefined {
        const location = findNpcLocation(name)
        const currentRoom = client.Map.currentRoom
        if (!location || !currentRoom?.id) {
            return undefined
        }
        const findPath = client.Map.findPath?.bind(client.Map)
        if (!findPath) {
            return undefined
        }
        try {
            const path = findPath(currentRoom.id, location)
            if (!path || path.length === 0) {
                return undefined
            }
            return path.length - 1
        } catch (_e) {
            return undefined
        }
    }

    function disable() {
        client.Triggers.removeByTag(tag)
        stopTimer()
    }

    init()

    return {
        npc,
        enabled: () => enabled,
        packages: () => packages,
        setPackages: (p: any[]) => { packages = p },
        currentPackage: () => currentPackage,
        setCurrentPackage: (pkg: any) => { currentPackage = pkg },
        deliveryTrigger: () => deliveryTrigger,
        setDeliveryTrigger: (t: any) => { deliveryTrigger = t },
        init,
        disable,
        packageLineCallback,
        packageTableCallback,
        handleCommand,
        leadToPackage,
    }
}
