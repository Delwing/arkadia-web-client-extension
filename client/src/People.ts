import Client from "./Client";
import {color, RESET, findClosestColor} from './Colors';
import {stripAnsiCodes} from './Triggers';
import appEventBus from "./events/app-event-bus";
import {dataCatalog} from "./dataCatalog/catalogInstance";
import {getItemSync} from "./storage";

export default class People {

    tag = 'people'
    client: Client
    guildFilter: string[] = []
    enemyGuilds: string[] = []
    guildColors: Record<string, string | undefined> = {}

    constructor(clientExtension: Client) {
        this.client = clientExtension
        const settings = getItemSync('settings')
        this.guildFilter = settings.guilds
        this.enemyGuilds = settings.enemyGuilds
        this.guildColors = settings.guildColors
        appEventBus.on('settings', (settings) => {
            this.guildFilter = settings.guilds
            this.enemyGuilds = settings.enemyGuilds
            this.guildColors = settings.guildColors
            this.registerPeopleTriggers()
        })
        this.registerPeopleTriggers()
    }

    private async registerPeopleTriggers() {
        const RED = findClosestColor('#ff0000')
        const addedNames = new Set<string>()
        const people = await dataCatalog.getPeopleStore().getData()
        this.client.Triggers.removeByTag(this.tag)
        console.log('Registering people triggers', this.guildColors)
        people.forEach(replacement => {
            const state = this.shouldHighlight(replacement)
            if (!state) {
                return
            }

            const descCallback = (rawLine: string, _line: string, matches: RegExpMatchArray) => {
                const index = matches.index || 0
                const token = matches[0]
                const suffix = rawLine.substring(index + token.length)
                const nextWord = stripAnsiCodes(suffix)
                    .toLowerCase()
                    .replace(/^\s+/, '')
                if (nextWord.startsWith('chaosu')) {
                    return rawLine
                }
                return this.buildDescHighlight(rawLine, token, index, replacement, state, RED)
            }

            this.client.Triggers.registerTokenTrigger(replacement.description, descCallback, this.tag, {caseInsensitive: true})

            if (state.isEnemy || (state.inGuild && state.guildColor !== undefined)) {
                const key = `${replacement.name}|${replacement.guild}`
                if (!addedNames.has(key) && replacement.name.length > 2) {
                    const chosenColor = state.isEnemy ? RED : state.guildColor!
                    const nameCallback = (rawLine: string, _line: string, matches: RegExpMatchArray) => {
                        const index = matches.index || 0
                        const token = matches[0]
                        return this.buildNameHighlight(rawLine, token, index, chosenColor)
                    }
                    this.client.Triggers.registerTokenTrigger(replacement.name, nameCallback, this.tag, {caseInsensitive: true})
                    addedNames.add(key)
                }
            }
        })

    }

    private shouldHighlight(replacement: { guild: string }) {
        const inGuild = this.guildFilter.includes(replacement.guild)
        const isEnemy = this.enemyGuilds.includes(replacement.guild)
        const guildColorHex = this.guildColors[replacement.guild]
        const guildColor = guildColorHex ? findClosestColor(guildColorHex) : undefined
        if (!inGuild && !isEnemy) {
            return undefined
        }
        return {inGuild, isEnemy, guildColor}
    }

    private buildNameHighlight(rawLine: string, token: string, index: number, colorCode: number) {
        const prefix = rawLine.substring(0, index)
        const suffix = rawLine.substring(index + token.length)
        const highlighted = color(colorCode) + token + RESET
        return prefix + highlighted + suffix
    }

    private buildDescHighlight(rawLine: string, token: string, index: number, replacement: {
        name: string;
        guild: string
    }, state: { inGuild: boolean; isEnemy: boolean; guildColor?: number }, RED: number) {
        const prefix = rawLine.substring(0, index)
        const suffix = rawLine.substring(index + token.length)
        let highlighted = token
        if (state.isEnemy) {
            highlighted = color(RED) + token + RESET
        }

        let suffixText = ` \x1B[22;38;5;228m(${replacement.name} \x1B[22;38;5;210m${replacement.guild}\x1B[22;38;5;228m)`
        if (state.isEnemy) {
            suffixText = ' ' + color(RED) + `(${replacement.name} ${replacement.guild})` + RESET
        } else if (state.inGuild && state.guildColor !== undefined) {
            suffixText = ' ' + color(state.guildColor) + `(${replacement.name} ${replacement.guild})` + RESET
        }

        return prefix + highlighted + suffixText + suffix
    }

}
