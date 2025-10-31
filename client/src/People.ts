import { subscribe as subscribeToPeopleStore, refresh as refreshPeopleStore, forceRefresh as forceRefreshPeopleStore } from './peopleStore';
import type { PersonEntry } from './types/people';
import Client from "./Client";
import {color, RESET, findClosestColor} from './Colors';
import TriggerLine from "./triggers/TriggerLine";

export default class People {

    tag = 'people'
    client: Client
    guildFilter: string[] = []
    enemyGuilds: string[] = []
    guildColors: Record<string, string | undefined> = {}
    people: PersonEntry[] = []
    private loadErrorLogged = false
    private refreshPromise: Promise<PersonEntry[] | undefined> | null = null

    constructor(clientExtension: Client) {
        this.client = clientExtension
        subscribeToPeopleStore(snapshot => {
            if (snapshot) {
                this.people = snapshot
                this.loadErrorLogged = false
                this.registerPeopleTriggers()
            } else {
                this.people = []
                this.client.Triggers.removeByTag(this.tag)
            }
        })
        this.client.on('settings', (settings) => {
            const detail = (settings ?? {}) as {
                guilds?: string[];
                enemyGuilds?: string[];
                guildColors?: Record<string, string | undefined>;
            };
            this.guildFilter = detail.guilds || []
            this.enemyGuilds = detail.enemyGuilds || []
            this.guildColors = detail.guildColors || {}
            this.ensurePeopleTriggers()
        })
        this.ensurePeopleTriggers()
    }

    private ensurePeopleTriggers(forceRefresh = false) {
        if (!forceRefresh && this.people.length > 0) {
            this.registerPeopleTriggers()
            return
        }

        if (this.refreshPromise && !forceRefresh) {
            return
        }

        this.refreshPromise = (forceRefresh ? forceRefreshPeopleStore() : refreshPeopleStore())
            .catch(error => {
                this.handleLoadError(error)
                return undefined
            })
            .finally(() => {
                this.refreshPromise = null
            })
    }

    private handleLoadError(error: unknown) {
        if (!this.loadErrorLogged) {
            console.warn('Failed to load people database', error)
            this.loadErrorLogged = true
        }
        if (this.people.length === 0) {
            this.client.Triggers.removeByTag(this.tag)
        }
    }

    private registerPeopleTriggers() {
        this.client.Triggers.removeByTag(this.tag)
        const RED = findClosestColor('#ff0000')
        const addedNames = new Set<string>()
        this.people.forEach(replacement => {
            const state = this.shouldHighlight(replacement)
            if (!state) {
                return
            }

            const descCallback = (rawLine: string, _line: string, matches: RegExpMatchArray, _type: string, triggerLine?: TriggerLine) => {
                const index = matches.index || 0
                const token = matches[0]
                const lineInstance = triggerLine ?? new TriggerLine(rawLine)
                const plainSuffix = lineInstance.text.substring(index + token.length)
                const nextWord = plainSuffix
                    .toLowerCase()
                    .replace(/^\s+/, '')
                if (nextWord.startsWith('chaosu')) {
                    return triggerLine ? undefined : rawLine
                }
                return this.buildDescHighlight(triggerLine, rawLine, token, index, replacement, state, RED)
            }

            this.client.Triggers.registerTokenTrigger(replacement.description, descCallback, this.tag, {caseInsensitive: true})

            if (state.isEnemy || (state.inGuild && state.guildColor !== undefined)) {
                const key = `${replacement.name}|${replacement.guild}`
                if (!addedNames.has(key) && replacement.name.length > 2) {
                    const chosenColor = state.isEnemy ? RED : state.guildColor!
                    const nameCallback = (rawLine: string, _line: string, matches: RegExpMatchArray, _type: string, triggerLine?: TriggerLine) => {
                        const token = matches[0]
                        const lineInstance = triggerLine ?? new TriggerLine(rawLine)
                        const indices = this.findTokenIndices(lineInstance.text, token)
                        if (indices.length === 0) {
                            return triggerLine ? undefined : rawLine
                        }
                        for (let i = indices.length - 1; i >= 0; i -= 1) {
                            this.buildNameHighlight(lineInstance, token, indices[i], chosenColor)
                        }
                        return lineInstance
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
        return { inGuild, isEnemy, guildColor }
    }

    private isWordCharacter(char: string | undefined) {
        if (!char) {
            return false
        }
        const lower = char.toLowerCase()
        const upper = char.toUpperCase()
        if (lower !== upper) {
            return true
        }
        return char >= '0' && char <= '9'
    }

    private findTokenIndices(text: string, token: string) {
        const indices: number[] = []
        if (!token) {
            return indices
        }
        const haystack = text.toLowerCase()
        const needle = token.toLowerCase()
        let index = haystack.indexOf(needle)
        while (index !== -1) {
            const before = index === 0 ? undefined : text[index - 1]
            const after = index + token.length >= text.length ? undefined : text[index + token.length]
            if (!this.isWordCharacter(before) && !this.isWordCharacter(after)) {
                indices.push(index)
            }
            index = haystack.indexOf(needle, index + needle.length)
        }
        return indices
    }

    private buildNameHighlight(line: TriggerLine, token: string, index: number, colorCode: number) {
        const end = index + token.length
        const original = line.text.substring(index, end)
        return line.replace([index, end], color(colorCode) + original + RESET)
    }

    private buildDescHighlight(
        triggerLine: TriggerLine | undefined,
        rawLine: string,
        token: string,
        index: number,
        replacement: { name: string; guild: string },
        state: { inGuild: boolean; isEnemy: boolean; guildColor?: number },
        RED: number
    ) {
        const line = triggerLine ?? new TriggerLine(rawLine)
        const end = index + token.length
        let suffixText = ` \x1B[22;38;5;228m(${replacement.name} \x1B[22;38;5;210m${replacement.guild}\x1B[22;38;5;228m)`
        if (state.isEnemy) {
            line.replace([index, end], color(RED) + token + RESET)
            suffixText = RESET + ' ' + color(RED) + `(${replacement.name} ${replacement.guild})` + RESET
        } else if (state.inGuild && state.guildColor !== undefined) {
            suffixText = ' ' + color(state.guildColor) + `(${replacement.name} ${replacement.guild})` + RESET
        }
        return line.insert(end, suffixText)
    }

}
