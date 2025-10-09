import {colorStringInLine, findClosestColor, RESET} from "./Colors";
import Client from "./Client";
import { Trigger } from "./Triggers";
import toTitleCase from "./utils/toTitleCase";

const tag = "packageHelper";
const pickCommand = "wybierz paczke"
const packageLineRegex = /^ \|\s*(?<heavy>\*)?\s*(?<number>\d+)\. (?<name>.*?)(?:, (?<city>[\w' ]+?))?\s+(?<gold>\d+)\/\s?(?<silver>\d+)\/\s?(?<copper>\d+)\s+(?:nieogr\.|(?<time>\d+))/
const packageTableRegex = /Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:[\s\S]*?Symbolem \* oznaczono przesylki ciezkie\./
const shortInfo = RESET + 'Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:\n'

const STANDARD_NAME_COLUMN_WIDTH = 33;
const STANDARD_REWARD_COLUMN_WIDTH = 13;
const STANDARD_TIME_COLUMN_WIDTH = 12;
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

export default class PackageHelper {

    private client: Client
    npc: Record<string, number> = {}
    enabled = false;

    private packages: { name: string; time?: string; distance?: number }[] = []
    private listTime = 0
    private timer: number | undefined
    private remover = () => {
    };
    private locationListener;
    private standardRowExtraWidth = 0;

    private pick: number
    private currentPackage: { name: string; time?: string; distance?: number };

    deliveryTrigger: Trigger;
    private pickTrigger: Trigger;
    private failTrigger: Trigger;

    constructor(clientExtension: Client) {
        this.client = clientExtension
        this.client.addEventListener('npc', (event) => {
            event.detail.forEach((item: { name: string | number; loc: number; }) => this.npc[item.name] = item.loc)
        })


        this.client.addEventListener('settings', (event) => {
            const setting = event.detail?.packageHelper
            const shouldEnable = setting === undefined ? true : setting
            if (!this.enabled && shouldEnable) {
                this.init()
            } else if (this.enabled && !shouldEnable) {
                this.disable()
            }
        })

        this.init()
    }

    init() {
        this.enabled = true;
        this.client.Triggers.registerTrigger(/^Wypisano na niej duzymi literami: ([a-zA-Z ']+).*$/, (rawLine, __, matches): string => {
            const name = toTitleCase(matches[1])
            this.leadToPackage(name)
            if (!this.currentPackage || this.currentPackage.name !== name) {
                this.currentPackage = { name }
            }
            this.client.sendEvent('packageStatus', { recipient: name })
            if (!this.deliveryTrigger) {
                this.registerDeliveryTrigger()
            }
            const colorCode = this.npc[name] ? KNOWN_NPC_COLOR : findClosestColor('#ffff00')
            return colorStringInLine(rawLine, matches[1], colorCode)
        }, tag)
        this.client.Triggers.registerMultilineTrigger(packageTableRegex, this.packageTableCallback(), tag)
    }

    private onPackageList() {
        this.packages = []
        this.listTime = Date.now()
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = undefined
            this.client.sendEvent('packageStatus', null)
        }
        this.remover();
        this.remover = this.client.addEventListener("command", ({detail: command}) => this.handleCommand(command));
    }

    private handleCommand(command: string) {
        if (!command.startsWith(pickCommand)) {
            return;
        }
        this.pick = parseInt(command.substring(pickCommand.length + 1).trim())
        this.pickTrigger = this.client.Triggers.registerOneTimeTrigger(/^.* przekazuje ci jakas paczke\./, (): undefined => {
            if (this.failTrigger) {
                this.client.Triggers.removeTrigger(this.failTrigger)
                this.failTrigger = undefined
            }
            this.currentPackage = this.packages[this.pick - 1]
            this.leadToPackage(this.currentPackage.name)
            this.startTimer()
            this.registerDeliveryTrigger()
        })
        this.failTrigger = this.client.Triggers.registerOneTimeTrigger(pickFailMessages, (): undefined => {
            if (this.pickTrigger) {
                this.client.Triggers.removeTrigger(this.pickTrigger)
                this.pickTrigger = undefined
            }
        })
    }

    private packageLineCallback() {
        return (rawLine: string, _line: string, matches: RegExpMatchArray) => {
            const info = this.parsePackageLine(matches)
            const { line } = this.composeStandardRow(rawLine, info)
            return this.makePackageClickable(line, info)
        };
    }

    private isMobileBrowser() {
        return typeof navigator !== 'undefined' &&
            /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    private packageTableCallback() {
        const lineCallback = this.packageLineCallback();
        const widthLimit = 78;
        return (raw: string): string => {
            this.onPackageList();
            const lines = raw.split('\n');
            const narrow = this.isMobileBrowser() ||
                (this.client.contentWidth && this.client.contentWidth < widthLimit);
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
                    const info = this.parsePackageLine(matches);
                    const city = info.city ? `, ${info.city}` : '';
                    const heavy = info.heavy ? '* ' : '  ';
                    const first = RESET + `${heavy}${info.index}. ${info.name}${city}`;
                    const colorCode = this.npc[info.name] ? KNOWN_NPC_COLOR : UNKNOWN_NPC_COLOR;
                    const clickable = this.client.OutputHandler.makeClickable(
                        colorStringInLine(first, info.name, colorCode),
                        info.name,
                        () => {
                            this.client.sendCommand('wybierz paczke ' + info.index);
                        },
                        'wybierz paczke ' + info.index
                    ) + RESET;
                    const time = info.time ? info.time + ' godz.' : 'nieogr.';
                    const distanceText = info.distance !== undefined ? ` dystans: ${info.distance}` : '';
                    const second = `   ${info.gold}/${info.silver}/${info.copper} ${time}${distanceText}\n`;
                    out.push(clickable, second);
                });
                return out.join('\n');
            }
            this.standardRowExtraWidth = 0;
            const borderLines: number[] = [];
            const headerLines: number[] = [];
            const processed = lines.map((line, index) => {
                const matches = line.match(packageLineRegex);
                if (matches) {
                    return lineCallback(line, '', matches) || line;
                }
                if (this.isBorderLine(line)) {
                    borderLines.push(index);
                } else if (this.isHeaderLine(line)) {
                    headerLines.push(index);
                }
                return line;
            });
            if (this.standardRowExtraWidth > 0) {
                borderLines.forEach(idx => {
                    processed[idx] = this.expandBorderLine(processed[idx], this.standardRowExtraWidth);
                });
                headerLines.forEach(idx => {
                    processed[idx] = this.expandHeaderLine(processed[idx], this.standardRowExtraWidth);
                });
            }
            return processed.join('\n');
        };
    }

    private parsePackageLine(matches: RegExpMatchArray): PackageLineInfo {
        const name = matches.groups.name;
        const distance = this.getDistanceToNpc(name);
        const info: PackageLineInfo = {
            index: matches.groups.number,
            heavy: !!matches.groups.heavy,
            name,
            city: matches.groups.city,
            gold: matches.groups.gold,
            silver: matches.groups.silver,
            copper: matches.groups.copper,
            time: matches.groups.time,
            distance,
        };
        this.packages.push({ name, time: info.time, distance });
        return info;
    }

    private padRight(value: string, length: number): string {
        if (value.length >= length) {
            return value;
        }
        return value + ' '.repeat(length - value.length);
    }

    private composeStandardRow(rawLine: string, info: PackageLineInfo): { line: string } {
        const city = info.city ? `, ${info.city}` : '';
        const heavyPrefix = info.heavy ? '* ' : '  ';
        const number = info.index.padStart(2, ' ');
        const namePart = `${heavyPrefix}${number}. ${info.name}${city}`;
        const nameColumn = this.padRight(namePart, STANDARD_NAME_COLUMN_WIDTH);
        const reward = `${info.gold}/${info.silver}/${info.copper}`;
        const rewardColumn = this.padRight(reward, STANDARD_REWARD_COLUMN_WIDTH);
        const timeText = info.time ? `${info.time} godz.` : 'nieogr.';
        const timeColumn = this.padRight(timeText, STANDARD_TIME_COLUMN_WIDTH);
        const distanceValue = info.distance !== undefined ? `${info.distance}` : '--';
        const distanceColumn = this.padRight(`dystans: ${distanceValue}`, STANDARD_DISTANCE_COLUMN_WIDTH);
        const line = ` | ${nameColumn}${rewardColumn}${timeColumn}${distanceColumn}`;
        this.standardRowExtraWidth = Math.max(this.standardRowExtraWidth, Math.max(0, line.length - rawLine.length));
        return { line };
    }

    private makePackageClickable(line: string, info: PackageLineInfo): string {
        const colorCode = this.npc[info.name] ? KNOWN_NPC_COLOR : UNKNOWN_NPC_COLOR;
        const command = `${pickCommand} ${info.index}`;
        return this.client.OutputHandler.makeClickable(
            colorStringInLine(line, info.name, colorCode),
            info.name,
            () => {
                this.client.sendCommand(command);
            },
            command
        );
    }

    private isBorderLine(line: string): boolean {
        const trimmed = line.trim();
        if (!trimmed) {
            return false;
        }
        if (/^[\\\\\/+].*[\\\\\/+]$/.test(trimmed)) {
            return true;
        }
        return /^[+\-=]{3,}$/.test(trimmed);
    }

    private isHeaderLine(line: string): boolean {
        const trimmed = line.trim();
        if (!trimmed) {
            return false;
        }
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            return true;
        }
        return /^ \|/.test(line) && !packageLineRegex.test(line);
    }

    private expandBorderLine(line: string, extraWidth: number): string {
        if (extraWidth <= 0) {
            return line;
        }
        const trimmed = line.trim();
        if (!trimmed) {
            return line;
        }
        const lastChar = trimmed[trimmed.length - 1];
        const insertPos = line.lastIndexOf(lastChar);
        const fillerChar = trimmed.length > 1 ? trimmed[1] : '-';
        if (insertPos >= 0) {
            return line.slice(0, insertPos) + fillerChar.repeat(extraWidth) + line.slice(insertPos);
        }
        return line;
    }

    private expandHeaderLine(line: string, extraWidth: number): string {
        if (extraWidth <= 0) {
            return line;
        }
        const trimmed = line.trim();
        if (!trimmed) {
            return line;
        }
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            if (/dystans/i.test(trimmed)) {
                const lastPipe = line.lastIndexOf('|');
                if (lastPipe >= 0) {
                    return line.slice(0, lastPipe) + ' '.repeat(extraWidth) + line.slice(lastPipe);
                }
                return line;
            }
            const lastPipe = line.lastIndexOf('|');
            if (lastPipe >= 0) {
                const before = line.slice(0, lastPipe).replace(/\s+$/, '');
                const padding = Math.max(extraWidth - 1, 1);
                return `${before} Dystans ${' '.repeat(padding)}|`;
            }
            return line;
        }
        if (line.startsWith(' |')) {
            return line + ' '.repeat(extraWidth);
        }
        return line;
    }

    private startTimer() {
        if (!this.currentPackage) {
            return
        }
        const hours = this.currentPackage.time ? parseInt(this.currentPackage.time as any) : null
        if (this.timer) {
            clearInterval(this.timer)
        }
        if (hours == null) {
            this.client.sendEvent('packageStatus', {recipient: this.currentPackage.name})
            this.timer = undefined
            return
        }
        const total = hours * 120
        const update = () => {
            const left = total - Math.floor((Date.now() - this.listTime) / 1000)
            this.client.sendEvent('packageStatus', {recipient: this.currentPackage!.name, seconds: left})
            if (left <= 0 && this.timer) {
                clearInterval(this.timer)
                this.timer = undefined
            }
        }
        update()
        this.timer = window.setInterval(update, 1000)
    }

    private stopTimer() {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = undefined
        }
        this.client.sendEvent('packageStatus', null)
    }

    private registerDeliveryTrigger() {
        this.deliveryTrigger = this.client.Triggers.registerOneTimeTrigger(/^(Oddajesz|Zwracasz) pocztowa paczke/, (_, __, matches): undefined => {
            if (matches[1] === 'Oddajesz') {
                if (!this.npc[this.currentPackage.name]) {
                    this.client.println(`Nowy adresat: ${this.currentPackage.name} | ${this.client.Map.currentRoom.id}`)
                    this.client.port.postMessage({
                        type: 'NEW_NPC',
                        name: this.currentPackage.name,
                        loc: this.client.Map.currentRoom.id
                    })
                }
            }
            this.currentPackage = undefined;
            this.stopTimer();
            this.deliveryTrigger = undefined;
        })
    }

    private leadToPackage(name: string) {
        const location = this.findNpcLocation(name)
        if (location) {
            this.client.sendEvent('leadTo', location)
        }
        if (this.locationListener) {
            this.client.removeEventListener('enterLocation', this.locationListener)
        }
        this.locationListener = ({detail: {id: roomId}}) => {
            if (roomId === location) {
                this.client.removeEventListener('enterLocation', this.locationListener)
                this.client.addEventListener('gmcp_msg.room.exits', () => {
                    this.client.FunctionalBind.set('oddaj paczke', () => {
                        return this.client.sendCommand('oddaj paczke');
                    })
                }, {once: true})
            }
        }
        this.client.addEventListener('enterLocation', this.locationListener)
    }

    private findNpcLocation(name: string): number | undefined {
        let location = this.npc[name]
        if (!location) {
            const found = Object.entries(this.npc).find(([npc]) => name.toLowerCase() === npc.toLowerCase())
            if (found) {
                [, location] = found
            }
        }
        return location
    }

    private getDistanceToNpc(name: string): number | undefined {
        const location = this.findNpcLocation(name)
        const currentRoom = this.client.Map.currentRoom
        if (!location || !currentRoom?.id) {
            return undefined
        }
        const findPath = this.client.Map.findPath?.bind(this.client.Map)
        if (!findPath) {
            return undefined
        }
        try {
            const path = findPath(currentRoom.id, location)
            if (!path || path.length === 0) {
                return undefined
            }
            return path.length - 1
        } catch (e) {
            return undefined
        }
    }

    disable() {
        this.client.Triggers.removeByTag(tag)
        this.stopTimer()
    }

}
