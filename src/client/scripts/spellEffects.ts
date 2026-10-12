import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";

/**
 * Countdowns for the spells we are under, read off the game's own warnings.
 *
 * As a spell wears thin the game says how long it has left, in words:
 * "Czujesz, ze efekt dzialania czaru 'przeobrazenie' powoli slabnie, ale powinien
 * sie jeszcze utrzymac przez dosc dlugi czas." Each phrase is an exact time left -
 * a recorded przeobrazenie halved it from one warning to the next, ending ten
 * seconds before "efekt dzialania czaru 'przeobrazenie' konczy sie" - and the
 * wording names the spell, so the one pattern serves every spell that speaks it.
 * Each warning re-syncs the countdown, so a cast whose length depends on the
 * caster still lands on time.
 */

/** Seconds left that each phrase stands for. */
export const SPELL_TIME_LEFT: Record<string, number> = {
    // Not yet seen; the next step up the halving the recorded ones follow.
    "bardzo dlugi": 960,
    "dlugi": 480,
    "dosc dlugi": 240,
    "pewien": 120,
    "dosc krotki": 60,
    "krotki": 30,
    "bardzo krotki": 10,
};

const WANING = /efekt dzialania czaru '([^']+)' powoli slabnie, ale powinien sie jeszcze utrzymac przez ([a-z ]+?) czas/;
const ENDED = /efekt dzialania czaru '([^']+)' konczy sie/;

const PREFIX = '[ CZAR ] ';
/** Wearing thin: amber, like the chip in its warning tone. */
const WANING_COLOR = createColorFormat('#ffb347');
/** Gone. */
const ENDED_COLOR = createColorFormat('#ff6347');

/**
 * How long a countdown that ran out stays up waiting for the line that ends it,
 * before it is taken down anyway - a spell dispelled or ended out of sight.
 */
const OVERDUE_MS = 60_000;

export interface SpellEffect {
    name: string;
    /** Seconds left, never below zero while the effect waits for its end line. */
    seconds: number;
}

export default function initSpellEffects(client: Client) {
    const tag = 'spellEffects';
    const endsAt = new Map<string, number>();
    let timer: number | null = null;

    function emit() {
        const now = Date.now();
        const effects: SpellEffect[] = [];
        for (const [name, end] of endsAt) {
            if (now - end > OVERDUE_MS) {
                endsAt.delete(name);
                continue;
            }
            effects.push({name, seconds: Math.max(0, Math.ceil((end - now) / 1000))});
        }
        effects.sort((a, b) => a.seconds - b.seconds);
        client.sendEvent('spellEffects', effects);
        if (endsAt.size === 0 && timer !== null) {
            clearInterval(timer);
            timer = null;
        }
    }

    function ensureTicking() {
        if (timer === null) {
            timer = window.setInterval(emit, 1000);
        }
    }

    client.Triggers.registerTrigger(WANING, (line, matches) => {
        const left = SPELL_TIME_LEFT[matches[2]];
        if (left !== undefined) {
            // client.now(): a warning replayed after a frozen tab counts from when it was said.
            endsAt.set(matches[1], client.now() + left * 1000);
            ensureTicking();
            emit();
        }
        return line.color([0, line.length], WANING_COLOR).prefix(PREFIX, WANING_COLOR);
    }, tag);

    client.Triggers.registerTrigger(ENDED, (line, matches) => {
        if (endsAt.delete(matches[1])) {
            emit();
        }
        return line.color([0, line.length], ENDED_COLOR).prefix(PREFIX, ENDED_COLOR);
    }, tag);

    // A new life is a new body; whatever was cast on the old one went with it.
    client.on('reset', () => {
        endsAt.clear();
        emit();
    });
}
