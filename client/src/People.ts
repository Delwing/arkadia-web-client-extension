import { loadPeople, type PersonEntry } from './peopleLoader';
import Client from "./Client";
import {color, RESET, findClosestColor} from './Colors';
import AnsiString from "./AnsiString";

export default class People {

    tag = 'people'
    client: Client
    guildFilter: string[] = []
    enemyGuilds: string[] = []
    guildColors: Record<string, string | undefined> = {}
    people: PersonEntry[] = []
    private loadErrorLogged = false
    private peopleLoadPromise: Promise<void> | null = null

    constructor(clientExtension: Client) {
        this.client = clientExtension
        this.client.addEventListener('settings', (event: CustomEvent) => {
            this.guildFilter = event.detail.guilds || []
            this.enemyGuilds = event.detail.enemyGuilds || []
            this.guildColors = event.detail.guildColors || {}
            this.ensurePeopleTriggers()
        })
        this.ensurePeopleTriggers()
    }

    private ensurePeopleTriggers(forceRefresh = false) {
        if (!forceRefresh && this.people.length > 0) {
            this.registerPeopleTriggers()
        }

        if (this.peopleLoadPromise && !forceRefresh) {
            return
        }

        this.peopleLoadPromise = loadPeople(forceRefresh)
            .then(people => {
                this.people = people
                this.loadErrorLogged = false
                this.registerPeopleTriggers()
            })
            .catch(error => {
                this.handleLoadError(error)
            })
            .finally(() => {
                this.peopleLoadPromise = null
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

            const descCallback = (rawLine: string, _line: string, matches: RegExpMatchArray, _type: string, context?: AnsiString) => {
                const index = matches.index || 0
                const token = matches[0]
                const ctx = context ?? new AnsiString(rawLine)
                const plainSuffix = ctx.getPlain().substring(index + token.length)
                const nextWord = plainSuffix
                    .toLowerCase()
                    .replace(/^\s+/, '')
                if (nextWord.startsWith('chaosu')) {
                    return ctx.getRaw()
                }
                return this.buildDescHighlight(ctx, token, index, replacement, state, RED)
            }

            this.client.Triggers.registerTokenTrigger(replacement.description, descCallback, this.tag, {caseInsensitive: true})

            if (state.isEnemy || (state.inGuild && state.guildColor !== undefined)) {
                const key = `${replacement.name}|${replacement.guild}`
                if (!addedNames.has(key) && replacement.name.length > 2) {
                    const chosenColor = state.isEnemy ? RED : state.guildColor!
                    const nameCallback = (rawLine: string, _line: string, matches: RegExpMatchArray, _type: string, context?: AnsiString) => {
                        const index = matches.index || 0
                        const token = matches[0]
                        const ctx = context ?? new AnsiString(rawLine)
                        return this.buildNameHighlight(ctx, token, index, chosenColor)
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

    private buildNameHighlight(context: AnsiString, token: string, index: number, colorCode: number) {
        context.replacePlainRange(index, index + token.length, color(colorCode) + token + RESET)
        return context.getRaw()
    }

    private buildDescHighlight(context: AnsiString, token: string, index: number, replacement: { name: string; guild: string }, state: { inGuild: boolean; isEnemy: boolean; guildColor?: number }, RED: number) {
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

        context.replacePlainRange(index, index + token.length, highlighted + suffixText)
        return context.getRaw()
    }

}
