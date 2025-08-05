import people from './people.json'
import Client from "./Client";
import {color, RESET, findClosestColor} from './Colors';
import {stripAnsiCodes} from './Triggers';

export default class People {

    tag = 'people'
    client: Client
    guildFilter: string[] = []
    enemyGuilds: string[] = []
    guildColors: Record<string, string | undefined> = {}

    constructor(clientExtension: Client) {
        this.client = clientExtension
        this.client.addEventListener('settings', (event: CustomEvent) => {
            this.guildFilter = event.detail.guilds || []
            this.enemyGuilds = event.detail.enemyGuilds || []
            this.guildColors = event.detail.guildColors || {}
            this.registerPeopleTriggers()
        })
    }

    registerPeopleTriggers() {
        this.client.Triggers.removeByTag(this.tag)
        const RED = findClosestColor('#ff0000')
        const addedNames = new Set<string>()
        people.forEach(replacement => {
            const inGuild = this.guildFilter.includes(replacement.guild)
            const isEnemy = this.enemyGuilds.includes(replacement.guild)
            const guildColorHex = this.guildColors[replacement.guild]
            const guildColor = guildColorHex ? findClosestColor(guildColorHex) : undefined
            if (!inGuild && !isEnemy) {
                return
            }

            const descCallback = (rawLine: string, _line: string, matches: RegExpMatchArray) => {
                const index = matches.index || 0
                const token = matches[0]
                const prefix = rawLine.substring(0, index)
                const suffix = rawLine.substring(index + token.length)
                const nextWord = stripAnsiCodes(suffix)
                    .toLowerCase()
                    .replace(/^\s+/, '')
                if (nextWord.startsWith('chaosu')) {
                    return rawLine
                }
                let highlighted = token
                if (isEnemy) {
                    highlighted = color(RED) + token + RESET
                } else if (inGuild && guildColor !== undefined) {
                    // only color names, description remains uncolored
                    highlighted = token
                }

                let suffixText = ` \x1B[22;38;5;228m(${replacement.name} \x1B[22;38;5;210m${replacement.guild}\x1B[22;38;5;228m)`
                if (isEnemy) {
                    suffixText = ' ' + color(RED) + `(${replacement.name} ${replacement.guild})` + RESET
                } else if (inGuild && guildColor !== undefined) {
                    suffixText = ' ' + color(guildColor) + `(${replacement.name} ${replacement.guild})` + RESET
                }

                return prefix + highlighted + suffixText + suffix
            }

            this.client.Triggers.registerTokenTrigger(replacement.description, descCallback, this.tag, {caseInsensitive: true})

            if (isEnemy || (inGuild && guildColor !== undefined)) {
                const key = `${replacement.name}|${replacement.guild}`
                if (!addedNames.has(key) && replacement.name.length > 2) {
                    const nameCallback = (rawLine: string, _line: string, matches: RegExpMatchArray) => {
                        const index = matches.index || 0
                        const token = matches[0]
                        const prefix = rawLine.substring(0, index)
                        const suffix = rawLine.substring(index + token.length)
                        const chosenColor = isEnemy ? RED : guildColor!
                        const highlighted = color(chosenColor) + token + RESET
                        return prefix + highlighted + suffix
                    }
                    this.client.Triggers.registerTokenTrigger(replacement.name, nameCallback, this.tag, {caseInsensitive: true})
                    addedNames.add(key)
                }
            }
        })
    }

}
