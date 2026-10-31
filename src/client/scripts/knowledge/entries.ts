/**
 * Knowledge entries: every entry the game can name is highlighted in the output
 * and marked known for the character on sight; the details window (`/wiedza`)
 * shows what is known and what is missing.
 */
import {createColorFormat} from '@modules/core/Colors';
import {
    canonicalizeKnowledgeEntryGender,
    formatKnowledgeEntryForGender,
    KNOWLEDGE_DETAILS_TYPES,
    KnowledgeCharacterGender,
    KnowledgeDetailsSnapshot,
    KnowledgeDetailsType,
    parseKnowledgeGender,
} from '@modules/data/dataStores/knowledgeDetailsStore';
import {AnsiAwareBuffer} from '@client/ansi/FormatState.ts';
import {KNOWLEDGE_CATEGORY_CONFIG, KnowledgeCategoryBaseName} from '../../knowledgeCategories';
import type {KnowledgeContext} from './context';
import {recolorToken} from './highlight';
import type {KnowledgeHints} from './hints';
import {normalizeKnowledgeEntry} from './parsing';
import {markEntryKnown} from './progress';
import {buildKnowledgeDetailsReportPayload} from './reports';

const KNOWLEDGE_ENTRY_TRIGGER_TAG = 'knowledge-entry-triggers';
const KNOWLEDGE_ENTRY_HIGHLIGHT_COLOR = createColorFormat('#ffe066');

type KnowledgeEntryTriggerTarget = {
    category: KnowledgeCategoryBaseName;
    type: KnowledgeDetailsType;
    canonical: string;
};

function sameTarget(a: KnowledgeEntryTriggerTarget, b: KnowledgeEntryTriggerTarget): boolean {
    return a.category === b.category
        && a.type === b.type
        && normalizeKnowledgeEntry(a.canonical) === normalizeKnowledgeEntry(b.canonical);
}

export interface KnowledgeEntries {
    /** A new details snapshot is in `ctx.details`. */
    onSnapshot(): void;
    /** Sends the details window a fresh report, once the current burst of changes settles. */
    scheduleReportUpdate(): void;
    /** Off while `/wiedza_buduj` reads the game's list, which names every known entry. */
    setHighlighting(enabled: boolean): void;
    /** `/wiedza`: opens the details window. */
    openReport(): void;
}

export function createKnowledgeEntries(ctx: KnowledgeContext, hints: KnowledgeHints): KnowledgeEntries {
    const {client, detailsStore} = ctx;
    const pendingEntryUpdates: KnowledgeEntryTriggerTarget[] = [];
    let highlighting = true;
    let pendingGenderUpdate = false;
    let reportUpdateTimer: ReturnType<typeof setTimeout> | undefined;
    let lastCharacterKey = ctx.characterKey();

    function scheduleReportUpdate() {
        if (reportUpdateTimer != null) {
            clearTimeout(reportUpdateTimer);
        }
        reportUpdateTimer = setTimeout(() => {
            reportUpdateTimer = undefined;
            if (!ctx.details) return;
            const characterKey = ctx.characterKey();
            const payload = buildKnowledgeDetailsReportPayload(ctx.details, characterKey, ctx.gender);
            if (payload) {
                client.sendEvent('knowledgeDetailsReport', payload);
            }
            client.sendEvent('knowledgeDetailsUpdated', {character: characterKey});
        }, 50);
    }

    function markKnown(target: KnowledgeEntryTriggerTarget) {
        const canonical = canonicalizeKnowledgeEntryGender(target.canonical);
        if (normalizeKnowledgeEntry(canonical).length === 0) {
            return;
        }
        const update = {...target, canonical};

        if (!ctx.details) {
            if (!pendingEntryUpdates.some((queued) => sameTarget(queued, update))) {
                pendingEntryUpdates.push(update);
            }
            return;
        }

        const timestamp = Date.now();
        const characterKey = ctx.characterKey();
        void detailsStore
            .applyLocalChange((snapshot) => markEntryKnown(
                snapshot ?? ctx.details!, characterKey, update.category, update.type, canonical, timestamp,
            ))
            .then(() => hints.refresh())
            .catch((error) => {
                console.error('Failed to mark knowledge entry as known:', error);
            });
    }

    function registerEntryTriggers(snapshot: KnowledgeDetailsSnapshot | undefined) {
        client.Triggers.removeByTag(KNOWLEDGE_ENTRY_TRIGGER_TAG);
        if (!snapshot) {
            return;
        }

        // Each entry under its masculine and feminine wording
        const variantMap = new Map<string, KnowledgeEntryTriggerTarget[]>();
        const addVariant = (variant: string, target: KnowledgeEntryTriggerTarget) => {
            const trimmed = variant.trim();
            if (trimmed.length === 0) {
                return;
            }
            const existing = variantMap.get(trimmed);
            if (!existing) {
                variantMap.set(trimmed, [target]);
            } else if (!existing.some((entry) => sameTarget(entry, target))) {
                existing.push(target);
            }
        };

        for (const config of KNOWLEDGE_CATEGORY_CONFIG) {
            const definition = snapshot.data.definitions[config.base];
            if (!definition) {
                continue;
            }
            for (const type of KNOWLEDGE_DETAILS_TYPES) {
                for (const entry of definition[type] ?? []) {
                    if (typeof entry !== 'string') {
                        continue;
                    }
                    const canonical = canonicalizeKnowledgeEntryGender(entry);
                    if (canonical.trim().length === 0) {
                        continue;
                    }
                    const target = {category: config.base, type, canonical};
                    addVariant(canonical, target);
                    const femaleVariant = formatKnowledgeEntryForGender(canonical, 'female');
                    if (femaleVariant !== canonical) {
                        addVariant(femaleVariant, target);
                    }
                }
            }
        }

        for (const [token, targets] of variantMap.entries()) {
            client.Triggers.registerTokenTrigger(
                token,
                (line, matches) => {
                    if (!matches[0]) {
                        return line;
                    }
                    if (highlighting) {
                        recolorToken(line, matches, KNOWLEDGE_ENTRY_HIGHLIGHT_COLOR);
                    }
                    for (const target of targets) {
                        markKnown(target);
                    }
                    return line;
                },
                KNOWLEDGE_ENTRY_TRIGGER_TAG,
            );
        }
    }

    function persistCharacterGender(gender: KnowledgeCharacterGender) {
        if (!ctx.details) {
            pendingGenderUpdate = true;
            return;
        }

        const characterKey = ctx.characterKey();
        pendingGenderUpdate = false;
        if ((ctx.details.data.characters?.[characterKey]?.gender ?? null) === gender) {
            return;
        }

        const timestamp = Date.now();
        void detailsStore
            .applyLocalChange((snapshot) => {
                const baseSnapshot = snapshot ?? ctx.details!;
                const nextCharacters = {...(baseSnapshot.data.characters ?? {})};
                nextCharacters[characterKey] = {
                    ...(nextCharacters[characterKey] ?? {}),
                    gender,
                    updatedAt: timestamp,
                };
                return {...baseSnapshot, data: {...baseSnapshot.data, characters: nextCharacters}};
            })
            .catch((error) => {
                console.error('Failed to store knowledge character metadata:', error);
            });
    }

    client.on('gmcp.char.info', (detail) => {
        const characterKey = ctx.characterKey();
        if (lastCharacterKey !== characterKey) {
            hints.refresh();
        }
        lastCharacterKey = characterKey;

        const parsedGender = parseKnowledgeGender(detail);
        if (!parsedGender || ctx.gender === parsedGender) {
            return;
        }
        ctx.gender = parsedGender;
        persistCharacterGender(parsedGender);
    });

    /** Without the character's progress every entry is shown as missing. */
    function currentReport() {
        if (!ctx.details) {
            return null;
        }
        return buildKnowledgeDetailsReportPayload(ctx.details, ctx.characterKey(), ctx.gender)
            ?? buildKnowledgeDetailsReportPayload(ctx.details, null);
    }

    client.on('requestKnowledgeDetailsReport', () => {
        const payload = currentReport();
        if (payload) {
            client.sendEvent('knowledgeDetailsReport', payload);
        }
    });

    /** A message whose `/wiedza_buduj` is a link that runs it. */
    function printWithBuildLink(text: string) {
        const msg = new AnsiAwareBuffer(text);
        const cmdStart = msg.text.indexOf('/wiedza_buduj');
        if (cmdStart >= 0) {
            msg.createLink([cmdStart, cmdStart + '/wiedza_buduj'.length], {
                onClick: () => client.sendCommand('/wiedza_buduj'),
                title: 'Kliknij aby zbudować dane wiedzy',
            });
        }
        client.println(msg);
    }

    return {
        onSnapshot() {
            registerEntryTriggers(ctx.details);

            if (ctx.details && pendingEntryUpdates.length > 0) {
                for (const update of pendingEntryUpdates.splice(0)) {
                    markKnown(update);
                }
            }

            scheduleReportUpdate();
            hints.refresh();

            if (!ctx.details || !pendingGenderUpdate) {
                return;
            }
            const storedGender = ctx.details.data.characters?.[ctx.characterKey()]?.gender ?? null;
            if (ctx.gender && storedGender !== ctx.gender) {
                persistCharacterGender(ctx.gender);
            } else {
                pendingGenderUpdate = false;
            }
        },

        scheduleReportUpdate,

        setHighlighting(enabled) {
            highlighting = enabled;
        },

        openReport() {
            if (!ctx.details) {
                printWithBuildLink('Dane wiedzy nie sa jeszcze dostepne. Uzyj /wiedza_buduj, aby je zbudowac.');
                client.sendEvent('knowledgeDetailsReport', null);
                return;
            }
            const payload = currentReport();
            if (!payload) {
                printWithBuildLink('Brak danych definicji wiedzy. Uzyj /wiedza_buduj, aby je zaktualizowac.');
                client.sendEvent('knowledgeDetailsReport', null);
                return;
            }
            client.sendEvent('knowledgeDetails.popup.open');
            client.sendEvent('knowledgeDetailsReport', payload);
        },
    };
}
