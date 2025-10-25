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
        this.client.addEventListener('settings', (event: CustomEvent) => {
            this.guildFilter = event.detail.guilds || []
            this.enemyGuilds = event.detail.enemyGuilds || []
            this.guildColors = event.detail.guildColors || {}
            this.ensurePeopleTriggers()
        })
        this.client.addEventListener('uiSettings', () => {
            this.ensurePeopleTriggers(true)
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
                        const index = matches.index || 0
                        const token = matches[0]
                        return this.buildNameHighlight(triggerLine, rawLine, token, index, chosenColor)
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

    private buildNameHighlight(triggerLine: TriggerLine | undefined, rawLine: string, token: string, index: number, colorCode: number) {
        const line = triggerLine ?? new TriggerLine(rawLine)
        const end = index + token.length
        line.replace([index, end], color(colorCode) + token + RESET)
        const esc = "\u001b"
        const override = line.toAnsiString().replace(new RegExp(`${esc}\\[38;5;`, "g"), `${esc}[22;38;5;`)
        line.setOverrideAnsi(override)
        return triggerLine ? line : override
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
        line.insert(end, suffixText)
        const esc = "\u001b"
        const override = line.toAnsiString().replace(new RegExp(`${esc}\\[38;5;`, "g"), `${esc}[22;38;5;`)
        line.setOverrideAnsi(override)
        return triggerLine ? line : override
    }

}
