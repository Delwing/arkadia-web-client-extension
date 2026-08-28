import Client from "../Client";
import {isType} from "../Triggers";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";
import {characterStorage} from "@modules/core/storage";
import eventBus from "@modules/core/eventBus.ts";
import {createColorFormat} from "@modules/core/Colors";
import {getBehaviorSettings} from "@modules/core/settings";
import {getLongDir, isDirection} from "@shared/map/directions";

const STORAGE_KEY = 'carriages';

/** The ride is over and it is your move — worth picking out of the travel prose. */
const RIDE_HALTED_COLOR = createColorFormat('#ffff00');
const PLAIN = createColorFormat('#dddddd');

/** How long the full deposit stays refundable after leasing. Past it the stable keeps a part of it. */
const DEPOSIT_VALID_MS = 6 * 60 * 60 * 1000;

/** A boarding line adopts a freshly leased carriage only if the lease is this recent. */
const ADOPT_LEASE_MS = 60 * 1000;

export interface CarriageRecord {
    /** Vehicle description as the game first named it, e.g. "elegancka odkryta bryczke". */
    name: string;
    /** Epoch ms of the lease line, or 0 when the carriage was picked up without seeing one. */
    leasedAt: number;
    /** Room the carriage was leased in, or null when it was never observed. */
    leasedIn: number | null;
    /** Rent, worded as the game worded it - amounts arrive as words, not numbers. */
    rent: string | null;
    /** Deposit, worded as the game worded it. */
    deposit: string | null;
    /** Room the carriage was last left in, or null when it has never been seen parked. */
    parkedIn: number | null;
    /**
     * True while you are aboard. Persisted rather than kept in memory: a page reload while driving
     * would otherwise look exactly like a carriage whose parking spot we never learned.
     */
    driving: boolean;
}

/** A record enriched with everything the popup needs, so the UI never touches storage or the map. */
export interface CarriageEntry extends CarriageRecord {
    /** Stable key the popup passes back to address this record. */
    key: string;
    /** True for the carriage being driven right now. */
    driven: boolean;
    /** True while that carriage is actually rolling, as opposed to standing with you aboard. */
    moving: boolean;
    /** Gender of the vehicle noun, so the UI can agree its adjectives with it. */
    gender: 'm' | 'f';
    /** Epoch ms the full deposit lapses at, or 0 when the lease was never seen. */
    depositExpiresAt: number;
    /** Rooms rendered for display, e.g. "Wozownia, Scala (894)". Null when the room is unknown. */
    leasedInLabel: string | null;
    parkedInLabel: string | null;
}

/** Vehicle nouns in every case the triggers can see them, mapped to one stable form. */
const VEHICLE_NOUNS: Record<string, string> = {
    woz: 'woz', wozie: 'woz', wozu: 'woz',
    bryczka: 'bryczka', bryczce: 'bryczka', bryczki: 'bryczka', bryczke: 'bryczka',
    dylizans: 'dylizans', dylizansie: 'dylizans', dylizansu: 'dylizans',
};

/** Genitive of each vehicle type, for "zsiadz z ...". */
const VEHICLE_GENITIVE: Record<string, string> = {woz: 'wozu', bryczka: 'bryczki', dylizans: 'dylizansu'};

/** Locative of each vehicle type, for "usiadz na ...". */
const VEHICLE_LOCATIVE: Record<string, string> = {woz: 'wozie', bryczka: 'bryczce', dylizans: 'dylizansie'};

/** Grammatical gender of each vehicle type - only bryczka is feminine. */
const VEHICLE_GENDER: Record<string, 'm' | 'f'> = {woz: 'm', bryczka: 'f', dylizans: 'm'};

/** Accusative of each vehicle type, for "zatrzymaj ...". */
const VEHICLE_ACCUSATIVE: Record<string, string> = {woz: 'woz', bryczka: 'bryczke', dylizans: 'dylizans'};

/** The canonical vehicle noun is the last word of a key, e.g. "eleganck odkryt bryczka". */
const nounOf = (key: string): string => key.split(' ').pop() ?? '';

/** Adjective endings, longest first so "szybkiego" loses "iego" rather than "ego". */
const ADJECTIVE_SUFFIXES = [
    'iego', 'iemu',
    'ymi', 'imi', 'ych', 'ich', 'iej', 'ego', 'emu',
    'ej', 'ie', 'ym', 'im',
    'a', 'e', 'i', 'o', 'u', 'y',
];

function stem(word: string): string {
    for (const suffix of ADJECTIVE_SUFFIXES) {
        if (word.length - suffix.length >= 3 && word.endsWith(suffix)) {
            return word.slice(0, -suffix.length);
        }
    }
    return word;
}

/**
 * Polish declines both the adjectives and the vehicle noun, so one carriage shows up as
 * "elegancka odkryta bryczke" when leased, "eleganckiej odkrytej bryczce" when boarded and
 * "eleganckiej odkrytej bryczki" when left behind. Stemming the adjectives and mapping the noun
 * through a table collapses all of those onto a single key.
 */
export function carriageKey(description: string): string | null {
    const words = description.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const noun = VEHICLE_NOUNS[words[words.length - 1] ?? ''];
    if (!noun) return null;
    return [...words.slice(0, -1).map(stem), noun].join(' ');
}

export default function initCarriage(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const list = aliases ?? client.aliases;

    const load = (): Record<string, CarriageRecord> => characterStorage.get(STORAGE_KEY) ?? {};

    /**
     * Key of the carriage being driven right now, so parking can fall back to it. Restored from
     * storage because reloading the page does not put you back on the ground.
     */
    let currentKey: string | null = Object.entries(load()).find(([, record]) => record.driving)?.[0] ?? null;
    const currentRoomId = (): number | null => client.Map?.currentRoom?.id ?? null;

    /** Unmapped rooms carry their own id as a name, which reads as noise - fall back to the id alone. */
    const roomLabel = (id: number | null): string | null => {
        if (id === null) return null;
        const room = client.Map?.tryGetMapReader()?.getRoom(id) as { name?: string; area?: number } | undefined;
        const name = room?.name && room.name !== String(id) ? room.name : '';
        const areaName = room?.area !== undefined ? (client.Map?.getAreaName(String(room.area)) ?? '') : '';
        if (name && areaName) return `${name}, ${areaName} (${id})`;
        if (name) return `${name} (${id})`;
        return String(id);
    };

    /**
     * Whether the carriage is rolling right now. Not persisted: a ride does not survive a reload,
     * and the next "rusza"/"zatrzymuje sie" line settles it either way.
     */
    let moving = false;

    const entries = (): CarriageEntry[] => Object.entries(load()).map(([key, record]) => ({
        ...record,
        key,
        driven: !!record.driving,
        moving: !!record.driving && moving,
        gender: VEHICLE_GENDER[nounOf(key)] ?? 'm',
        depositExpiresAt: record.leasedAt > 0 ? record.leasedAt + DEPOSIT_VALID_MS : 0,
        leasedInLabel: roomLabel(record.leasedIn),
        parkedInLabel: roomLabel(record.parkedIn),
    }));

    /** Wheel markers for every carriage left standing somewhere, labelled by vehicle type. */
    const parkedMarkers = () => Object.entries(load())
        .filter(([, record]) => !record.driving && record.parkedIn !== null)
        .map(([key, record]) => ({roomId: record.parkedIn as number, label: nounOf(key)}));

    const publishMarkers = () => client.sendEvent('mapParkedCarriages', parkedMarkers());

    /** Persist and let an open popup refresh. Callers must settle currentKey first, so driven is right. */
    const save = (all: Record<string, CarriageRecord>) => {
        characterStorage.set(STORAGE_KEY, all);
        eventBus.emit('carriages.updated', {carriages: entries()});
        publishMarkers();
    };

    /**
     * While the carriage is rolling the numpad "zerknij" key halts it instead - looking around is
     * not what you reach for mid-ride. Published on the client so the direction binds can pick it
     * up without knowing anything about carriages.
     */
    const publishStopCommand = () => {
        const noun = moving && currentKey ? VEHICLE_ACCUSATIVE[nounOf(currentKey)] : undefined;
        client.carriageStopCommand = noun ? `zatrzymaj ${noun}` : null;
    };

    /** Latest step along the route we are leading by carriage, if any. */
    let routeStep: { nextCommand: string | null; atTransfer: boolean } = {nextCommand: null, atTransfer: false};

    /**
     * Offer what to do next while the wagon is standing still on a led route.
     *
     * Only while stopped: those are the moments the decision is yours - a junction, a dead end -
     * and setting the bind on every room passed would print a line each time. At the transfer point
     * the offer is the way out instead, which is the whole reason the route has a leg on foot.
     */
    /** True while the bind on offer is this route's, so nothing else's bind gets cleared. */
    let routeBindActive = false;

    const offerRouteBind = () => {
        const wanted = (() => {
            if (!client.carriageMode || moving) return null;
            if (getBehaviorSettings().carriageRouteBinds === false) return null;
            if (routeStep.atTransfer) {
                const noun = currentKey ? VEHICLE_GENITIVE[nounOf(currentKey)] : undefined;
                return noun ? `zsiadz z ${noun}` : null;
            }
            return routeStep.nextCommand;
        })();

        if (wanted) {
            setBind(wanted);
            routeBindActive = true;
            return;
        }
        // Only take away a bind this put there. Every stop of the wagon runs through here, and
        // whatever else is on offer at that moment - a transport at the quay, the way back into a
        // carriage standing in the room - is not ours to clear.
        if (routeBindActive) {
            clearOwnBind();
            routeBindActive = false;
        }
    };

    client.on('carriageRouteStep', step => {
        routeStep = step ?? {nextCommand: null, atTransfer: false};
        offerRouteBind();
    });

    const setMoving = (value: boolean) => {
        if (moving === value) return;
        moving = value;
        publishStopCommand();
        offerRouteBind();
        eventBus.emit('carriages.updated', {carriages: entries()});
    };

    /** Stop tracking a ride without emitting - callers here follow up with save(). */
    const stopMoving = () => {
        moving = false;
        publishStopCommand();
    };

    const setCarriageMode = (enabled: boolean) => {
        if (client.moveModeButton) {
            client.moveModeButton.disabled = enabled;
        }
        // Only announce real transitions. The transport tracker answers this event by re-applying
        // its last bind, so an unchanged mode resurrects a stale one - and the re-arm lines below
        // fire on every single stop while the mode is already on.
        if (client.carriageMode === enabled) return;
        client.carriageMode = enabled;
        client.sendEvent('carriageModeChanged', enabled);
    };

    const lease = (description: string, rent: string, deposit: string) => {
        const key = carriageKey(description);
        if (!key) return;
        const all = load();
        all[key] = {
            name: description,
            leasedAt: Date.now(),
            leasedIn: currentRoomId(),
            rent,
            deposit,
            parkedIn: null,
            driving: false,
        };
        save(all);
    };

    const board = (description: string) => {
        const key = carriageKey(description);
        if (!key) return;
        const all = load();
        if (!all[key]) {
            // The lease line names the carriage in a different case than the boarding line. The
            // stemmer normally reconciles the two; when it cannot, re-key the lease we just made
            // instead of tracking the same carriage twice.
            const orphan = Object.entries(all).find(([otherKey, record]) =>
                otherKey !== key
                && !record.driving
                && record.parkedIn === null
                && record.leasedAt > 0
                && Date.now() - record.leasedAt < ADOPT_LEASE_MS);
            if (orphan) {
                all[key] = orphan[1];
                delete all[orphan[0]];
            } else {
                all[key] = {name: description, leasedAt: 0, leasedIn: null, rent: null, deposit: null, parkedIn: null, driving: false};
            }
        }
        all[key].driving = true;
        currentKey = key;
        stopMoving();
        save(all);
    };

    const park = (description?: string) => {
        const key = (description ? carriageKey(description) : null) ?? currentKey;
        if (!key) return;
        if (currentKey === key) currentKey = null;
        stopMoving();
        const all = load();
        // Already on the ground: a second dismount line must not move the spot we recorded when we
        // actually got off, which by then is a room or more behind us.
        if (!all[key]?.driving) return;
        all[key].driving = false;
        all[key].parkedIn = currentRoomId();
        save(all);
    };

    /**
     * Reconnecting parks the carriage and puts you on the ground, whether you asked or not, so the
     * bookkeeping has to follow even though no dismount line is ever printed.
     */
    const reconnected = () => {
        if (!currentKey) return;
        park();
        setCarriageMode(false);
    };

    /**
     * Stay down long enough - past about half an hour - and there is no reconnect at all: the next
     * login is a fresh session, announced only by the object number changing. The wagon was parked
     * by the game long ago, so record it where we last were rather than leaving it marked as ridden
     * for ever.
     *
     * The map persists the last room it rendered, and nothing has moved us yet at this point, so
     * that value is still the room we were in when the link dropped.
     */
    const newSession = () => {
        if (!currentKey) return;
        const lastKnown = characterStorage.get('mapperRoomId');
        const key = currentKey;
        currentKey = null;
        stopMoving();
        setCarriageMode(false);

        const all = load();
        if (!all[key]) return;
        all[key].driving = false;
        if (typeof lastKnown === 'number') all[key].parkedIn = lastKnown;
        save(all);

        // Where it went is a guess from the last room we saw, so it is worth spotting in the login
        // wall of text - and worth being one click from checking.
        const parked = VEHICLE_GENDER[nounOf(key)] === 'f' ? 'zostala zaparkowana' : 'zostal zaparkowany';
        const note = new AnsiAwareBuffer();
        note.append(`${all[key].name} ${parked}`, RIDE_HALTED_COLOR);
        if (typeof lastKnown === 'number') {
            note.append(' w ', RIDE_HALTED_COLOR);
            const label = roomLabel(lastKnown) ?? String(lastKnown);
            const start = note.length;
            note.append(label, PLAIN);
            note.createLink([start, start + label.length], {
                onClick: () => client.sendEvent('leadTo', lastKnown),
                title: `Kliknij aby prowadzic do: ${label}`,
            });
        }
        note.append('.', RIDE_HALTED_COLOR);
        client.println(note);
    };

    const forget = (key: string) => {
        const all = load();
        if (!(key in all)) return;
        if (currentKey === key) { currentKey = null; stopMoving(); }
        delete all[key];
        save(all);
    };

    /** Command we put on the default functional bind, so we never clear somebody else's. */
    let ownBind: string | null = null;

    const setBind = (command: string) => {
        ownBind = command;
        client.FunctionalBind.set(command, () => client.sendCommand(command));
    };

    const clearOwnBind = () => {
        if (!ownBind) return;
        if (client.FunctionalBind.getCategory('default')?.getPrintable() === ownBind) {
            client.FunctionalBind.clearCategory('default');
        }
        ownBind = null;
    };

    const enable = (line: AnsiAwareBuffer) => {
        setCarriageMode(true);
        return line;
    };
    const disable = (line: AnsiAwareBuffer) => {
        setCarriageMode(false);
        return line;
    };

    client.Triggers.registerTrigger(/^Siadasz (?:w|na) (.*) (dylizansie|wozie|bryczce)\.$/, (line, matches) => {
        board(`${matches[1]} ${matches[2]}`);
        return enable(line);
    }, "carriageMode");
    client.Triggers.registerTrigger(/^Poza toba na (.*) (dylizansie|wozie|bryczce) siedzi /, (line, matches) => {
        board(`${matches[1]} ${matches[2]}`);
        return enable(line);
    }, "carriageMode");
    /**
     * The vehicle announces its own starts and stops by name: "Nieduzy jednokonny woz rusza na
     * zachod." / "Nieduzy jednokonny woz zatrzymuje sie." Both are keyed against the carriage we
     * are actually in, so a wagon belonging to somebody else in the same room is ignored - and so
     * are the transports, whose own stop lines name a vehicle we never leased.
     */
    const ridingKey = (matches: RegExpMatchArray): string | null => {
        const key = carriageKey(`${matches[1]} ${matches[2]}`);
        return key && key === currentKey ? key : null;
    };

    client.Triggers.registerTrigger(/^(.+) (woz|bryczka|dylizans) rusza na .+\.$/, (line, matches) => {
        if (ridingKey(matches)) {
            // Rolling is proof we are aboard, so this doubles as a re-arm after a reload.
            setCarriageMode(true);
            setMoving(true);
        }
        return line;
    }, "carriageMode");
    client.Triggers.registerTrigger(/^(.+) (woz|bryczka|dylizans) (?:powoli )?zatrzymuje sie\.$/, (line, matches) => {
        if (ridingKey(matches)) setMoving(false);
        return line;
    }, "carriageMode");

    // The vehicle stops on its own at junctions and dead ends; you are still aboard, so these only
    // re-arm the mode in case it was lost (reconnect, gagged boarding line, manual /woz).
    client.Triggers.registerTrigger(/^Przeciez (?:woz|bryczka|dylizans) juz jedzie\.$/, enable, "carriageMode");
    /**
     * Both of these mean the ride ended somewhere you have to decide what to do next, so they are
     * worth spotting in a wall of travel prose.
     *
     * Neither offers a bind of its own. Getting off is only one of the things you might do at the
     * end of a road - turning around is the other - and the bind it took over was usually a better
     * offer than the guess: the next step of a led route, or the transport waiting at the quay.
     */
    client.Triggers.registerTrigger(
        /^(?:Dojechaliscie do rozdrozy|Nie ma tu zadnej drogi, ktora mozna by dalej jechac)\.$/,
        line => {
            setCarriageMode(true);
            return line.color([0, line.length], RIDE_HALTED_COLOR);
        },
        "carriageMode",
    );

    client.Triggers.registerTrigger(/^Zsiadasz z (.*) (dylizansu|wozu|bryczki)\.$/, (line, matches) => {
        park(`${matches[1]} ${matches[2]}`);
        return disable(line);
    }, "carriageMode");
    client.Triggers.registerTrigger(/^Wstajesz i wysiadasz z (.*) (dylizansu|wozu|bryczki)\.$/, (line, matches) => {
        park(`${matches[1]} ${matches[2]}`);
        return disable(line);
    }, "carriageMode");
    // The return line is not guaranteed to use the same case as the lease line, so accept every
    // form the key table knows rather than just the accusative.
    client.Triggers.registerTrigger(/^Zwracasz (.*) (dylizansu?|wozu?|bryczk[aei])\b/, (line, matches) => {
        const key = carriageKey(`${matches[1]} ${matches[2]}`) ?? currentKey;
        if (key) forget(key);
        return disable(line);
    }, "carriageMode");
    // Two wordings depending on how long the link was down - "... przywracam polaczenie ..." for a
    // short drop, "polaczenie zostalo przywrocone" for a longer one - and both carry other text
    // around them, so this is unanchored.
    client.Triggers.registerTrigger(/przywracam polaczenie|polaczenie zostalo przywrocone/, line => {
        reconnected();
        return line;
    }, "carriageMode");
    // "Wynajmujesz lekki woz, placac dwadziescia piec zlotych monet kosztu najmu oraz jedna
    // mithrylowa monete zwrotnej kaucji." The comma, the "oraz" and "zwrotnej" are all optional -
    // the Mudlet package carried a shorter wording, so tolerate both.
    client.Triggers.registerTrigger(
        /^Wynajmujesz (.+?),? placac (.+?) kosztu najmu(?: oraz)? (.+?) (?:zwrotnej )?kaucji\.$/,
        (line, matches) => {
            lease(matches[1], matches[2], matches[3]);
            return line;
        },
        "carriageMode",
    );

    list.push({
        pattern: /^\/woz$/,
        callback: () => {
            setCarriageMode(!client.carriageMode);
            client.println(`Tryb wozu: ${client.carriageMode ? "wlaczony" : "wylaczony"}`);
        },
    });

    list.push({
        pattern: /^\/wozw$/,
        callback: () => {
            eventBus.emit('carriages.popup.open', {
                carriages: entries(),
                currentLocationId: currentRoomId(),
            });
        },
    });

    eventBus.on('carriages.remove', (payload: { key: string }) => {
        if (payload?.key) forget(payload.key);
    });

    // A pinned or docked popup is already open at load with nothing to show, and it asks again once
    // the map arrives so the room labels stop being bare ids.
    eventBus.on('carriages.request', () => {
        eventBus.emit('carriages.updated', {carriages: entries()});
    });

    // The bind belongs to one room only, so every move drops it. The map moves on GMCP, ahead of
    // the room text, which is why this only clears - see the room-contents trigger below for why
    // the bind itself is not set here.
    client.on('enterLocation', () => clearOwnBind());

    /**
     * Offer the way back into a carriage we left standing here. Keyed off the room-contents line
     * ("Nieduzy jednokonny woz.") rather than the location event, for two reasons: the map moves
     * before the room text arrives, so binding on the event prints the bind above the description;
     * and the line is proof the carriage is really still there, where a stored room id is only a
     * memory. The description declines differently than the boarding line, so it goes through the
     * same key as everything else.
     */
    client.Triggers.registerTrigger(isType('room.contents.object'), line => {
        if (client.carriageMode || currentKey) return line;
        const all = load();
        // One line can list several things - "Nieduzy jednokonny woz i kamienny menhir." - so each
        // item is keyed on its own and the first one we recognise as ours wins.
        const key = line.text.replace(/\.$/, '')
            .split(/\s*,\s*|\s+i\s+/)
            .map(item => carriageKey(item))
            .find((candidate): candidate is string => !!candidate && !!all[candidate] && !all[candidate].driving);
        if (!key) return line;
        const record = all[key];
        // Seeing it somewhere other than we remember means the note is stale - a reconnect parks it
        // without printing a dismount line - so trust our eyes over the note.
        const here = currentRoomId();
        if (here !== null && record.parkedIn !== here) {
            all[key].parkedIn = here;
            save(all);
        }
        const noun = VEHICLE_LOCATIVE[nounOf(key)];
        if (noun) setBind(`usiadz na ${noun}`);
        return line;
    }, "carriageMode");

    // The map asks on load, and again after a map reload drops its overlays.
    // A fresh session after a long drop arrives with no reconnect line, only a new object number.
    /**
     * The way the game just refused to take us, and where we stood when it did.
     *
     * Kept so repeating the command can mean "fine, I will walk it". Cleared as soon as we move,
     * since the refusal only ever applied to that one exit from that one room.
     */
    let refused: { exit: string; roomId: number | null } | null = null;

    /**
     * The exit driving `command` would actually aim at, named the way the refusal names it.
     *
     * A compass command is resolved through the map before the ride goes out, so "w" in a room
     * whose only westward exit is the special "barka" is sent as "jedz na barka" - and "barka" is
     * what comes back refused. Comparing the command as typed would never match that, which is why
     * the resolution is repeated here rather than the raw word compared. A special exit is not a
     * direction and has no long form, so it compares as itself.
     */
    const drivenExit = (command: string): string => {
        const cmd = command.trim().toLowerCase();
        if (!isDirection(cmd)) return getLongDir(cmd);
        return getLongDir(client.Map?.resolveDirection?.(cmd) ?? cmd);
    };

    // The refusal is the driver acting on our order rather than a reply to it, so it can land on
    // the prompt line - the same reason the on-foot "Nie widzisz zadnego wyjscia" trigger tolerates
    // a leading prompt.
    client.Triggers.registerTrigger(/^[ >]*Nie mozna jechac na (.+)\.$/, (line, matches) => {
        refused = {exit: matches[1].toLowerCase(), roomId: currentRoomId()};
        return line;
    }, "carriageMode");

    /**
     * Only actually leaving the room ends the refusal.
     *
     * The event fires for re-renders of the room we are already in as well as for moves - a GMCP
     * re-sync while the mapper is waiting to catch up renders the same room again - and a wagon
     * that has not gone anywhere must not forget it was just refused.
     */
    client.on('enterLocation', payload => {
        const id = (payload as { id?: number })?.id;
        if (refused && id !== refused.roomId) refused = null;
    });

    /**
     * Turn a repeat of a refused ride into "get off, then walk it".
     *
     * Two commands, so the dismount lands first. Carriage mode is dropped here rather than waiting
     * for the game's "Zsiadasz" line, because the walking command is composed immediately after and
     * would otherwise be dressed up as "jedz na ..." all over again.
     */
    client.registerCommandHook('carriage-dismount-on-refusal', (command) => {
        if (!refused || !client.carriageMode) return undefined;
        if (getBehaviorSettings().dismountOnRefusedRide !== true) return undefined;
        // The refusal names the direction in full ("Nie mozna jechac na poludnie.") while the
        // command that provoked it is usually the short form, and may not be a direction at all
        // once the map has resolved it into a special exit - so both go through drivenExit.
        if (drivenExit(command) !== getLongDir(refused.exit)) return undefined;

        const noun = currentKey ? VEHICLE_GENITIVE[nounOf(currentKey)] : undefined;
        if (!noun) return undefined;

        // Walk with the command as given, not the long form the refusal used, so the second half is
        // exactly what would have been sent on foot in the first place.
        const walk = command.trim();
        refused = null;
        // Park before the pair goes out. The walk advances the mapper as soon as it is sent, well
        // before the game's "Zsiadasz" line comes back, so leaving it to that trigger would record
        // the room we are heading to rather than the one we are leaving the wagon in.
        park();
        setCarriageMode(false);
        return `zsiadz z ${noun};${walk}`;
    });

    client.on('reset', () => newSession());

    client.on('requestMapParkedCarriages', () => publishMarkers());
    publishMarkers();
    // Covers the other side of the race with the popup: whichever of the two comes up second, one
    // of this emit and the popup's request lands after both exist.
    eventBus.emit('carriages.updated', {carriages: entries()});
}
