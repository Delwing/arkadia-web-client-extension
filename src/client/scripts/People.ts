import { subscribeMerged, refresh as refreshPeopleStore, forceRefresh as forceRefreshPeopleStore } from '@modules/data/peopleLoader';
import type { PersonListEntry } from '../types/people';
import Client from "../Client";
import {createColorFormat} from '@modules/core/Colors';
import {AnsiAwareBuffer, FormatStateSnapshot} from "@client/ansi/FormatState.ts";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";

const RED = createColorFormat('#ff0000')

export default class People {

    tag = 'people'
    client: Client
    guildFilter: string[] = []
    enemyGuilds: string[] = []
    guildColors: Record<string, string | undefined> = {}
    people: PersonListEntry[] = []
    private loadErrorLogged = false
    private refreshPromise: Promise<unknown> | null = null

    constructor(client: Client) {
        this.client = client
        subscribeMerged(snapshot => {
            if (snapshot) {
                this.people = snapshot
                this.loadErrorLogged = false
                this.registerPeopleTriggers()
            } else {
                this.people = []
                this.client.Triggers.removeByTag(this.tag)
            }
        })
        const applySettings = (settings: any) => {
            const detail = (settings ?? defaultSettings) as {
                guilds?: string[];
                enemyGuilds?: string[];
                guildColors?: Record<string, string | undefined>;
            };
            this.guildFilter = detail.guilds || []
            this.enemyGuilds = detail.enemyGuilds || []
            this.guildColors = detail.guildColors || {}
            this.ensurePeopleTriggers()
        }
        applySettings(characterStorage.get('settings'))
        this.client.scope.onDispose(characterStorage.onChange('settings', (settings) => {
            applySettings(settings)
        }))
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
            // Skip ignored entries - they should not create triggers
            if (replacement.ignored) {
                return
            }

            const state = this.shouldHighlight(replacement)
            if (!state) {
                return
            }

            const descCallback = (line: AnsiAwareBuffer, matches: RegExpMatchArray) => {
                const token = matches[0]
                const isTableLine = line.text.includes('|')

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
                    .replace(/^[,\s]+/, '')
                if (nextWord.startsWith('chaosu')) {
                    return line
                }

                // When followed by "znany/znana jako" - only color, no suffix
                const skipSuffix = nextWord.startsWith('znany jako') || nextWord.startsWith('znana jako')

                if (isTableLine) {
                    return this.buildDescHighlightInPlace(line, index + token.length, replacement, state, token, skipSuffix)
                }
                return this.buildDescHighlight(line, index + token.length, replacement, state, token, skipSuffix)
            }

            this.client.Triggers.registerTokenTrigger(replacement.description, descCallback, this.tag, {caseInsensitive: true})

            if (state.isEnemy || state.individualColor || (state.inGuild && state.guildColor !== undefined)) {
                const key = `${replacement.name}|${replacement.guild}`
                if (!addedNames.has(key) && replacement.name.length > 2) {
                    const chosenColor = state.isEnemy ? RED : (state.individualColor ?? state.guildColor!)
                    const nameCallback = (line: AnsiAwareBuffer, matches: RegExpMatchArray) => {
                        const token = matches[0]
                        const indices = this.findTokenIndices(line.text, token, true)
                        if (indices.length === 0) {
                            return line
                        }
                        for (let i = indices.length - 1; i >= 0; i -= 1) {
                            this.buildNameHighlight(line, token, indices[i], chosenColor)
                        }
                        return line
                    }
                    this.client.Triggers.registerTokenTrigger(replacement.name, nameCallback, this.tag, {caseInsensitive: false})
                    addedNames.add(key)
                }
            }
        })
    }

    private shouldHighlight(replacement: { guild: string; isEnemy?: boolean; color?: string }) {
        const inGuild = this.guildFilter.includes(replacement.guild)
        const isGuildEnemy = this.enemyGuilds.includes(replacement.guild)
        const isIndividualEnemy = replacement.isEnemy ?? false
        const isEnemy = isGuildEnemy || isIndividualEnemy
        const hasIndividualColor = !!replacement.color
        const guildColorHex = this.guildColors[replacement.guild]
        const guildColor = guildColorHex ? createColorFormat(guildColorHex) : undefined
        const individualColor = replacement.color ? createColorFormat(replacement.color) : undefined
        if (!inGuild && !isEnemy && !hasIndividualColor) {
            return undefined
        }
        return { inGuild, isEnemy, guildColor, individualColor }
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

    private findTokenIndices(text: string, token: string, caseSensitive = false) {
        const indices: number[] = []
        if (!token) {
            return indices
        }
        const haystack = caseSensitive ? text : text.toLowerCase()
        const needle = caseSensitive ? token : token.toLowerCase()
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
        return line.applyFormat([index, end], colorCode)
    }

    private buildDescHighlight(
        line: AnsiAwareBuffer,
        position: number,
        replacement: { name: string; guild: string },
        state: { inGuild: boolean; isEnemy: boolean; guildColor?: FormatStateSnapshot; individualColor?: FormatStateSnapshot },
        descriptionToken: string,
        skipSuffix = false
    ): AnsiAwareBuffer {
        const parenthesisColor = this.getNameColor(state)
        const guildColor = this.getGuildColor(state)

        // Build buffer with colored description and suffix
        const descStart = position - descriptionToken.length
        const descEnd = position
        const originalDesc = line.text.substring(descStart, descEnd)

        // Only color description when guild color is set, individual color is set, or when it's an enemy
        const descriptionColor = (state.guildColor !== undefined || state.isEnemy || state.individualColor !== undefined) ? parenthesisColor : line.getStateAt(descStart)

        if (skipSuffix) {
            // Only color the description, no suffix
            return line.replace([descStart, descEnd], originalDesc, descriptionColor)
        }

        const replacement_buffer = new AnsiAwareBuffer("")
            .append(originalDesc, descriptionColor)
            .append(` (${replacement.name} `, parenthesisColor)
            .append(replacement.guild, guildColor)
            .append(')', parenthesisColor)

        return line.replaceBuffer([descStart, descEnd], replacement_buffer)
    }

    private buildDescHighlightInPlace(
        line: AnsiAwareBuffer,
        position: number,
        replacement: { name: string; guild: string },
        state: { inGuild: boolean; isEnemy: boolean; guildColor?: FormatStateSnapshot; individualColor?: FormatStateSnapshot },
        descriptionToken: string,
        skipSuffix = false
    ): AnsiAwareBuffer {
        const parenthesisColor = this.getNameColor(state)
        const guildColor = this.getGuildColor(state)

        const descStart = position - descriptionToken.length
        const descEnd = position

        // Only color description when guild color is set, individual color is set, or when it's an enemy
        const descriptionColor = (state.guildColor !== undefined || state.isEnemy || state.individualColor !== undefined) ? parenthesisColor : line.getStateAt(descStart)

        // Color the description in place
        if (descriptionColor) {
            line.color([descStart, descEnd], descriptionColor)
        }

        if (skipSuffix) {
            return line
        }

        const textAfterDesc = line.text.substring(descEnd)

        // Check if there's already a "(to chyba Name)" pattern after the description
        const existingNameMatch = textAfterDesc.match(/^\s*\(to chyba ([^)]+)\)/)
        if (existingNameMatch) {
            const fullMatch = existingNameMatch[0]
            const existingName = existingNameMatch[1]
            const matchStart = descEnd + textAfterDesc.indexOf(fullMatch)
            const matchEnd = matchStart + fullMatch.length

            // Build replacement with colored name and guild suffix: "(to chyba Name GUILD)"
            const newSuffix = ` (to chyba ${existingName} ${replacement.guild})`

            // Find spaces available after the closing parenthesis
            const textAfterParen = line.text.substring(matchEnd)
            const spaceMatchAfter = textAfterParen.match(/^(\s+)/)
            const availableSpacesAfter = spaceMatchAfter ? spaceMatchAfter[1].length : 0

            // Calculate extra space needed for guild suffix
            const extraNeeded = newSuffix.length - fullMatch.length
            const leadingSpaces = fullMatch.match(/^\s*/)?.[0].length ?? 0

            if (extraNeeded <= availableSpacesAfter + leadingSpaces) {
                // We have enough space - build replacement with only Name and Guild colored
                // Keep "to chyba" and parentheses with their original color
                const originalState = line.getStateAt(matchStart)
                const suffixBuffer = new AnsiAwareBuffer("")
                    .append(` (to chyba `, originalState)
                    .append(existingName, parenthesisColor)
                    .append(` `, originalState)
                    .append(replacement.guild, guildColor)
                    .append(')', originalState)

                // Replace from match start (including leading space) to end of available space
                const replaceEnd = matchEnd + Math.max(0, extraNeeded)
                line.replaceBuffer([matchStart, replaceEnd], suffixBuffer)
            }

            return line
        }

        // Build the suffix to insert: " (Name Guild)"
        const suffix = ` (${replacement.name} ${replacement.guild})`

        // Find how many spaces are available after the description (until next non-space or |)
        const spaceMatch = textAfterDesc.match(/^(\s+)/)
        const availableSpaces = spaceMatch ? spaceMatch[1].length : 0

        // Only insert if we have enough space (need suffix length worth of spaces)
        if (availableSpaces >= suffix.length) {
            // Replace spaces with the colored suffix
            const suffixBuffer = new AnsiAwareBuffer("")
                .append(` (${replacement.name} `, parenthesisColor)
                .append(replacement.guild, guildColor)
                .append(')', parenthesisColor)

            line.replaceBuffer([descEnd, descEnd + suffix.length], suffixBuffer)
        }

        return line
    }

    private getGuildColor(state: { inGuild: boolean; isEnemy: boolean; guildColor?: FormatStateSnapshot; individualColor?: FormatStateSnapshot }) {
        if (state.isEnemy) {
            return RED
        }
        if (state.individualColor) {
            return state.individualColor
        }
        return state.inGuild && state.guildColor !== undefined ? state.guildColor : createColorFormat('#ff875f');
    }

    private getNameColor(state: { inGuild: boolean; isEnemy: boolean; guildColor?: FormatStateSnapshot; individualColor?: FormatStateSnapshot }) {
        if (state.isEnemy) {
            return RED
        }
        if (state.individualColor) {
            return state.individualColor
        }
        return state.inGuild && state.guildColor !== undefined ? state.guildColor : createColorFormat('#ffff5f');
    }
}
