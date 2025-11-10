import { subscribe as subscribeToPeopleStore, refresh as refreshPeopleStore, forceRefresh as forceRefreshPeopleStore } from '@modules/data/peopleStore';
import type { PersonEntry } from './types/people';
import Client from "./Client";
import {createColorFormat} from '@modules/core/Colors';
import {AnsiAwareBuffer, FormatStateSnapshot} from "@client/ansi/FormatState.ts";

const RED = createColorFormat('#ff0000')

export default class People {

    tag = 'people'
    client: Client
    guildFilter: string[] = []
    enemyGuilds: string[] = []
    guildColors: Record<string, string | undefined> = {}
    people: PersonEntry[] = []
    private loadErrorLogged = false
    private refreshPromise: Promise<PersonEntry[] | undefined> | null = null

    constructor(client: Client) {
        this.client = client
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
        const RED = createColorFormat('#ff0000')
        const addedNames = new Set<string>()
        this.people.forEach(replacement => {
            const state = this.shouldHighlight(replacement)
            if (!state) {
                return
            }

            const descCallback = (line: AnsiAwareBuffer, matches: RegExpMatchArray) => {
                const token = matches[0]

                // Find the description in the current line text (which may have been modified by previous triggers)
                const indices = this.findTokenIndices(line.text, token)
                if (indices.length === 0) {
                    return line
                }

                // Use the first match
                const index = indices[0]
                const plainSuffix = line.text.substring(index + token.length)
                const nextWord = plainSuffix
                    .toLowerCase()
                    .replace(/^\s+/, '')
                if (nextWord.startsWith('chaosu')) {
                    return line
                }
                return this.buildDescHighlight(line, index + token.length, replacement, state)
            }

            this.client.Triggers.registerTokenTrigger(replacement.description, descCallback, this.tag, {caseInsensitive: true})

            if (state.isEnemy || (state.inGuild && state.guildColor !== undefined)) {
                const key = `${replacement.name}|${replacement.guild}`
                if (!addedNames.has(key) && replacement.name.length > 2) {
                    const chosenColor = state.isEnemy ? RED : state.guildColor!
                    const nameCallback = (line: AnsiAwareBuffer, matches: RegExpMatchArray) => {
                        const token = matches[0]
                        const indices = this.findTokenIndices(line.text, token)
                        if (indices.length === 0) {
                            return line
                        }
                        for (let i = indices.length - 1; i >= 0; i -= 1) {
                            this.buildNameHighlight(line, token, indices[i], chosenColor)
                        }
                        return line
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
        const guildColor = guildColorHex ? createColorFormat(guildColorHex) : undefined
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

    private buildNameHighlight(line: AnsiAwareBuffer, token: string, index: number, colorCode: FormatStateSnapshot) {
        const end = index + token.length
        const original = line.text.substring(index, end)
        return line.replace([index, end], original, colorCode)
    }

    private buildDescHighlight(
        line: AnsiAwareBuffer,
        position: number,
        replacement: { name: string; guild: string },
        state: { inGuild: boolean; isEnemy: boolean; guildColor?: FormatStateSnapshot }
    ): AnsiAwareBuffer {
        const parenthesisColor = this.getNameColor(state)
        const guildColor = this.getGuildColor(state)

        const suffix = new AnsiAwareBuffer("")
            .append(` (${replacement.name} `, parenthesisColor)
            .append(replacement.guild, guildColor)
            .append(')', parenthesisColor)


        return line.insertBuffer(position, suffix)
    }

    private getGuildColor(state: { inGuild: boolean; isEnemy: boolean; guildColor?: FormatStateSnapshot }) {
        if (state.isEnemy) {
            return RED
        }
        return state.inGuild && state.guildColor !== undefined ? state.guildColor : createColorFormat('#ff875f');
    }

    private getNameColor(state: { inGuild: boolean; isEnemy: boolean; guildColor?: FormatStateSnapshot }) {
        if (state.isEnemy) {
            return RED
        }
        return state.inGuild && state.guildColor !== undefined ? state.guildColor : createColorFormat('#ffff5f');
    }
}
