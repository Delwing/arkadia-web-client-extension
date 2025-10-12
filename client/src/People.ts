import type { PersonEntry } from './types/people';
import Client from "./Client";
import {color, RESET, findClosestColor} from './Colors';
import {stripAnsiCodes} from './Triggers';
import services from './runtime/service-registry';
import type { PeopleDataCatalog } from './runtime/data';

export default class People {

    tag = 'people'
    client: Client
    guildFilter: string[] = []
    enemyGuilds: string[] = []
    guildColors: Record<string, string | undefined> = {}
    people: PersonEntry[] = []
    private loadErrorLogged = false
    private peopleLoadPromise: Promise<void> | null = null
    private readonly catalog: PeopleDataCatalog

    constructor(clientExtension: Client, catalog: PeopleDataCatalog = services.peopleCatalog) {
        this.client = clientExtension
        this.catalog = catalog

        const existingPeople = this.catalog.getPeopleData()
        if (existingPeople) {
            this.people = [...existingPeople]
        }

        this.catalog.readyForPeople$().subscribe((event) => {
            this.people = [...event.data]
            this.loadErrorLogged = false
            this.registerPeopleTriggers()
        })

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
            return
        }

        const metadata = this.catalog.getPeopleMetadata()
        const isLoading = metadata?.status === 'loading'
        if (!forceRefresh && (isLoading || this.peopleLoadPromise)) {
            return
        }

        this.peopleLoadPromise = this.catalog
            .loadPeopleData()
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
        return { inGuild, isEnemy, guildColor }
    }

    private buildNameHighlight(rawLine: string, token: string, index: number, colorCode: number) {
        const prefix = rawLine.substring(0, index)
        const suffix = rawLine.substring(index + token.length)
        const highlighted = color(colorCode) + token + RESET
        return prefix + highlighted + suffix
    }

    private buildDescHighlight(rawLine: string, token: string, index: number, replacement: { name: string; guild: string }, state: { inGuild: boolean; isEnemy: boolean; guildColor?: number }, RED: number) {
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
