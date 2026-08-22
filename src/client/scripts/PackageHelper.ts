import {addLocalNpc} from "@modules/data/npcStore";
import {createColorFormat} from "@modules/core/Colors";
import Client from "../Client";
import {Trigger} from "../Triggers";
import toTitleCase from "../utils/toTitleCase";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";
import {containerAction} from "@client/scripts/bagManager";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";

const tag = "packageHelper";
const pickCommand = "wybierz paczke"
const packageLineRegex = /^ \|\s*(?<heavy>\*)?\s*(?<number>\d+)\. (?<name>.*?)(?:, (?<city>[\w' ]+?))?\s+(?<gold>\d+)\/\s?(?<silver>\d+)\/\s?(?<copper>\d+)\s+(?:nieogr\.|(?<time>\d+))/
const packageTableRegex = /Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:[\s\S]*?Symbolem \* oznaczono przesylki ciezkie\./
const shortInfo = 'Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:\n'
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

const KNOWN_NPC_COLOR = createColorFormat('#63ba41');
const UNKNOWN_NPC_COLOR = createColorFormat('#aaaaaa');

export default function initPackageHelper(client: Client) {
    const npc: Record<string, number> = {};
    let enabled = false;
    let packageInContainer = false;

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

    const applySettings = (event: any) => {
        const detail = (event ?? defaultSettings) as { packageHelper?: boolean; packageInContainer?: boolean };
        const shouldEnable = !!detail.packageHelper;
        packageInContainer = detail?.packageInContainer ?? false;
        if (!enabled && shouldEnable) {
            init()
        } else if (enabled && !shouldEnable) {
            disable()
        }
    }
    applySettings(characterStorage.get('settings'))
    characterStorage.onChange('settings', (settings) => {
        applySettings(settings)
    })

    function init() {
        enabled = true;
        client.Triggers.registerTrigger(/^Wypisano na niej duzymi literami: ([a-zA-Z ']+).*$/, (line, matches) => {
            const name = toTitleCase(matches[1])
            leadToPackage(name)
            if (!currentPackage || currentPackage.name !== name) {
                currentPackage = { name }
            }
            client.sendEvent('packageStatus', { recipient: name, location: findNpcLocation(name) })
            if (!deliveryTrigger) {
                registerDeliveryTrigger()
            }
            const colorCode = npc[name] ? KNOWN_NPC_COLOR : createColorFormat('#ffff00')
            const buffer = typeof line === 'string' ? new AnsiAwareBuffer(line) : line;
            const nameIndex = buffer.text.indexOf(matches[1]);
            if (nameIndex !== -1) {
                buffer.color([nameIndex, nameIndex + matches[1].length], colorCode);
            }
            return buffer;
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
        pickTrigger = client.Triggers.registerOneTimeTrigger(/^.* przekazuje ci jakas paczke\./, (line) => {
            if (failTrigger) {
                client.Triggers.removeTrigger(failTrigger)
                failTrigger = undefined
            }
            currentPackage = packages[pick - 1]
            if (packageInContainer) {
                containerAction(client, "other", "put", "pocztowa paczke");
            }
            leadToPackage(currentPackage.name)
            startTimer()
            registerDeliveryTrigger()
            return line;
        })
        failTrigger = client.Triggers.registerOneTimeTrigger(pickFailMessages, (line) => {
            if (pickTrigger) {
                client.Triggers.removeTrigger(pickTrigger)
                pickTrigger = undefined
            }
            return line;
        })
    }

    function packageLineCallback() {
        return (line: AnsiAwareBuffer, matches: RegExpMatchArray) => {
            const info = parsePackageLine(matches)

            // Extend the line with distance info by inserting before the last |
            const lastPipeIndex = line.text.lastIndexOf('|')
            if (lastPipeIndex !== -1) {
                const distanceValue = info.distance !== undefined ? `${info.distance}` : '--'
                const distanceText = ` dystans: ${distanceValue}`
                const normalized = distanceText.startsWith(' ') ? distanceText : ` ${distanceText}`
                const padded = padRight(normalized, STANDARD_DISTANCE_COLUMN_WIDTH)
                line.insert(lastPipeIndex, padded)
            }

            // Color the name in the buffer
            const colorCode = npc[info.name] ? KNOWN_NPC_COLOR : UNKNOWN_NPC_COLOR;
            const nameIndex = line.text.indexOf(info.name)
            if (nameIndex !== -1) {
                line.color([nameIndex, nameIndex + info.name.length], colorCode)

                // Make the name clickable
                line.createLink([nameIndex, nameIndex + info.name.length], {
                    onClick: (ev) => {
                        ev.preventDefault();
                        client.sendCommand(`${pickCommand} ${info.index}`);
                    },
                    onContextMenu: (ev) => {
                        ev.preventDefault();
                        // Right click shows the command in chat
                        client.println(`Komenda: ${pickCommand} ${info.index}`);
                    },
                    title: `Kliknij, aby wybrać paczkę #${info.index} dla ${info.name}`
                });
            }
            return line
        };
    }

    function isMobileBrowser() {
        return typeof navigator !== 'undefined' &&
            /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    function packageTableCallback() {
        const lineCallback = packageLineCallback();
        const widthLimit = 78;
        return (line: AnsiAwareBuffer) => {
            onPackageList();
            const lines = line.splitLines();
            const narrow = isMobileBrowser() ||
                (client.contentWidth && client.contentWidth < widthLimit);
            if (narrow) {
                const originalFormatting = lines.length > 0 ? lines[0].getStateAt(0) : undefined;
                const output = new AnsiAwareBuffer(shortInfo, originalFormatting);
                lines.forEach(lineBuffer => {
                    const lineText = lineBuffer.text;
                    if (lineText.startsWith('Tablica zawiera liste')) {
                        return;
                    }
                    if (/^Symbolem \* oznaczono przesylki ciezkie\./.test(lineText)) {
                        return;
                    }
                    const matches = lineText.match(packageLineRegex);
                    if (!matches) {
                        return;
                    }
                    const info = parsePackageLine(matches);
                    const city = info.city ? `, ${info.city}` : '';
                    const heavy = info.heavy ? '* ' : '  ';
                    const baseState = lineBuffer.getStateAt(0);
                    const firstLine = new AnsiAwareBuffer(`${heavy}${info.index}. ${info.name}${city}`, baseState);
                    const colorCode = npc[info.name] ? KNOWN_NPC_COLOR : UNKNOWN_NPC_COLOR;
                    const nameIndex = firstLine.text.indexOf(info.name);
                    if (nameIndex !== -1) {
                        firstLine.color([nameIndex, nameIndex + info.name.length], colorCode);

                        // Make the name clickable
                        firstLine.createLink([nameIndex, nameIndex + info.name.length], {
                            onClick: (ev) => {
                                ev.preventDefault();
                                client.sendCommand(`${pickCommand} ${info.index}`);
                            },
                            onContextMenu: (ev) => {
                                ev.preventDefault();
                                // Right click shows the command in chat
                                client.println(`Komenda: ${pickCommand} ${info.index}`);
                            },
                            title: `Kliknij, aby wybrać paczkę #${info.index} dla ${info.name}`
                        });
                    }
                    const time = info.time ? info.time + ' godz.' : 'nieogr.';
                    const distanceText = info.distance !== undefined ? ` dystans: ${info.distance}` : ' dystans: --';
                    const secondLine = new AnsiAwareBuffer(`   ${info.gold}/${info.silver}/${info.copper} ${time}${distanceText}\n`, baseState);

                    output.append('\n', originalFormatting);
                    output.appendBuffer(firstLine);
                    output.append('\n', originalFormatting);
                    output.appendBuffer(secondLine);
                    // Add a blank line between packages with gray formatting
                    const blankLine = new AnsiAwareBuffer(' \n', originalFormatting);
                    output.appendBuffer(blankLine);
                });
                return output;
            }
            const output = new AnsiAwareBuffer();
            const processedBuffers: AnsiAwareBuffer[] = [];
            lines.forEach(lineBuffer => {
                const lineText = lineBuffer.text;
                const matches = lineText.match(packageLineRegex);
                if (matches) {
                    const result = lineCallback(lineBuffer, matches);
                    if (result) {
                        processedBuffers.push(result);
                    }
                } else if (isStandardTopOrBottomBorder(lineText)) {
                    const extended = extendBorderLine(lineText, '=');
                    const baseState = lineBuffer.getStateAt(0);
                    const newBuffer = new AnsiAwareBuffer();
                    newBuffer.append(extended, baseState);
                    processedBuffers.push(newBuffer);
                } else if (isStandardSeparator(lineText)) {
                    const extended = extendBorderLine(lineText, '-');
                    const baseState = lineBuffer.getStateAt(0);
                    const newBuffer = new AnsiAwareBuffer();
                    newBuffer.append(extended, baseState);
                    processedBuffers.push(newBuffer);
                } else if (isStandardHeaderLine(lineText)) {
                    const extended = appendDistanceColumn(lineText, ' Dystans');
                    const baseState = lineBuffer.getStateAt(0);
                    const newBuffer = new AnsiAwareBuffer();
                    newBuffer.append(extended, baseState);
                    processedBuffers.push(newBuffer);
                } else if (isStandardSubHeaderLine(lineText)) {
                    const extended = appendDistanceColumn(lineText, ' w krokach');
                    const baseState = lineBuffer.getStateAt(0);
                    const newBuffer = new AnsiAwareBuffer();
                    newBuffer.append(extended, baseState);
                    processedBuffers.push(newBuffer);
                } else if (isStandardFooterLine(lineText)) {
                    const extended = appendDistanceColumn(lineText, '');
                    const baseState = lineBuffer.getStateAt(0);
                    const newBuffer = new AnsiAwareBuffer();
                    newBuffer.append(extended, baseState);
                    processedBuffers.push(newBuffer);
                } else if (lineText.startsWith(' |')) {
                    const extended = appendDistanceColumn(lineText, '');
                    const baseState = lineBuffer.getStateAt(0);
                    const newBuffer = new AnsiAwareBuffer();
                    newBuffer.append(extended, baseState);
                    processedBuffers.push(newBuffer);
                } else {
                    processedBuffers.push(lineBuffer);
                }
            });

            for (let i = 0; i < processedBuffers.length; i++) {
                output.appendBuffer(processedBuffers[i]);
                if (i < processedBuffers.length - 1) {
                    output.append('\n');
                }
            }
            return output
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
            client.sendEvent('packageStatus', {recipient: currentPackage.name, location: findNpcLocation(currentPackage.name)})
            timer = undefined
            return
        }
        const total = hours * 120
        const update = () => {
            const left = total - Math.floor((Date.now() - listTime) / 1000)
            client.sendEvent('packageStatus', {recipient: currentPackage!.name, seconds: left, location: findNpcLocation(currentPackage!.name)})
            if (left <= 0 && timer) {
                clearInterval(timer)
                timer = undefined
            }
        }
        update()
        timer = client.scope.interval(update, 1000)
    }

    function stopTimer() {
        if (timer) {
            clearInterval(timer)
            timer = undefined
        }
        client.sendEvent('packageStatus', null)
    }

    function registerDeliveryTrigger() {
        deliveryTrigger = client.Triggers.registerOneTimeTrigger(/^(Oddajesz|Zwracasz) pocztowa paczke/, (triggerLine, matches) => {
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
                    client.FunctionalBind.set('oddaj paczke', () => {
                        if (packageInContainer) {
                            containerAction(client, "other", "take", "pocztowa paczke");
                        }
                        client.sendCommand('oddaj paczke');
                    }, false);
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
        enabled = false;
        client.Triggers.removeByTag(tag)
        stopTimer()
    }
}
