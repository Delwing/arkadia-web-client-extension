import type Client from "./Client";
import {characterStorage} from "@modules/core/storage";
import type {GmcpCharInfo} from "@shared/events";

/**
 * Arkadia gives every object a numeric id, players included, and GMCP keys
 * everything about us on it: our hp, whether we are in combat, paralysed or
 * busy reading. Scripts therefore have to know which object in the room is us.
 *
 * Two different things move that number, and they must not be confused:
 *
 * 1. **A new life.** The id belongs to the object instance, so a login produces a
 *    different one - and so does dying and respawning. Either way the old session
 *    is over, which is what the `reset` event is for, and that stays the default
 *    reading of an id we have not seen before.
 * 2. **A new body, same life.** `przeobrazenie` and the appearance scrolls rebuild
 *    the character in place, handing out a fresh id and giving the old one back
 *    when the effect lapses, some twenty minutes later. Nothing about the session
 *    changed, so `reset` there would wipe the chat history, combat stats, the clock
 *    session and the counters for no reason - and every script still watching the
 *    old id would go quiet, most visibly the mapper, which stays paused because the
 *    `editing: false` that ends a read arrives under the new id and never reaches
 *    {@link initPausers}.
 *
 * Only the spell messages tell the two apart, so a new id mid-session is settled a
 * tick late - long enough for the line that explains it to arrive in the same frame,
 * whichever order the two come in, and short enough that nothing notices the wait.
 *
 * {@link sessionNum} therefore moves for a new life but not for a new body, and
 * {@link num} follows whichever body we are wearing right now.
 *
 * A third case moves nothing but still has to be handled: the session proxy can hand
 * a session back that this client was already in, after a dropped socket or a page
 * reload. Char.Info is sent when a session opens, not when a client reattaches to one,
 * so a resume brings no announcement of who we are - and reading the reattach as a
 * login would fire `reset` at the next change of body. See {@link handleResume}.
 */

/**
 * The tail of the line a change of appearance ends with - the scrolls and the
 * spell share it - and the line that announces przeobrazenie wearing off. Matched
 * on a fragment rather than whole, since the server wraps at the screen width.
 */
const TRANSFORM_START = /Czujesz jednak, ze cos sie zmienilo\.\.\.$/;
const TRANSFORM_END = /efekt dzialania czaru 'przeobrazenie' konczy sie/;

/**
 * How long after a Char.Info that moved the id we assume the server is telling
 * us about the transformation itself, and skip guessing. Whether Arkadia resends
 * Char.Info for a change of body is not certain, so both paths have to work; the
 * message and the GMCP frame can also arrive in either order.
 */
const CHAR_INFO_GRACE_MS = 3000;

/**
 * How many `objects.nums` updates a re-identification is given before it gives
 * up. Failing leaves the id unknown, which every consumer already guards for -
 * far better than adopting the wrong object and pointing the attack binds at it.
 */
const REIDENTIFY_ATTEMPTS = 5;

/**
 * How long one of the spell messages vouches for a change of id as a change of body
 * rather than a death. Generous, because the message can be a frame or two ahead of
 * the Char.Info that confirms it.
 */
const TRANSFORM_WINDOW_MS = 10000;

export default class PlayerIdentity {
    private readonly client: Client;

    /** The object we are currently wearing, or undefined while it is unknown. */
    private current?: number;
    /** The object the session was opened with. Unmoved by a transformation. */
    private session?: number;
    /** The id we wore when the current transformation started. */
    private preTransform?: number;
    private lastName?: string;

    private lastNums: number[] = [];
    private previousNums: number[] = [];
    /** The room's objects as of just before the body changed. */
    private numsBefore: number[] = [];
    private awaiting?: { expected?: number; attemptsLeft: number };

    private lastCharInfoNumChange = 0;
    private lastTransformMessage = 0;
    /** The id a mid-session change is waiting to be judged on; see settleNewBody. */
    private pending?: number;
    /**
     * The id storage says this life was opened with, taken up again after a resume
     * brought us back into a session we can no longer be told about. Held as a
     * candidate rather than adopted outright; see adoptStoredNum.
     */
    private resumeCandidate?: number;
    /**
     * Whether a connection has been opened since the last Char.Info. Starts true
     * so the first Char.Info of a page load counts as a session start, as it did
     * before any of this existed.
     */
    private connectedSinceCharInfo = true;

    constructor(client: Client) {
        this.client = client;

        this.client.on('gmcp.char.info', info => this.handleCharInfo(info));
        this.client.on('gmcp.objects.nums', nums => this.handleNums(nums));
        this.client.on('client.connect', () => {
            this.connectedSinceCharInfo = true;
        });
        this.client.on('proxy.session', info => {
            if (info?.resumed && !info.upstreamClosed) {
                this.handleResume();
            }
        });
        this.client.on('client.disconnect', () => {
            // The id deliberately survives the gap. A dropped socket is not a dropped
            // character: the proxy resumes the same telnet session, and Char.Info is
            // only pushed when one is opened, so forgetting who we are here left us
            // unidentified for the rest of the evening after any blink of the network
            // - our own object listed among the strangers, with an attack shortcut on
            // it. Nothing is lost by keeping it: a genuine relogin, as this character
            // or another, arrives with a Char.Info that starts a new life regardless.
            //
            // Only the verdict in flight goes, since the frame it would be judged on
            // may never finish arriving.
            this.pending = undefined;
        });

        // Guarded because a couple of unit tests stub Triggers down to line parsing.
        if (typeof this.client.Triggers?.registerTrigger === 'function') {
            this.registerTriggers();
        }
    }

    /** The object id of the body we are in, or undefined while it is unknown. */
    get num(): number | undefined {
        return this.current;
    }

    /** The id the session was opened with - what "is this still the same life" means. */
    get sessionNum(): number | undefined {
        return this.session;
    }

    private registerTriggers() {
        const tag = 'playerIdentity';
        this.client.Triggers.registerTrigger(TRANSFORM_START, line => {
            this.lastTransformMessage = Date.now();
            this.handleBodyChanged();
            return line;
        }, tag);
        this.client.Triggers.registerTrigger(TRANSFORM_END, line => {
            this.lastTransformMessage = Date.now();
            this.handleBodyChanged(this.preTransform ?? this.session);
            return line;
        }, tag);
    }

    /**
     * The proxy handed back the telnet session we were already in, so nothing about
     * this attach is a login - whatever the socket underneath it did.
     *
     * Two things follow. A Char.Info arriving later in such a session can only be a
     * change of body, and must not be read as a new life and fire `reset`; the flag
     * that would have said so is cleared here. And a resume brings no Char.Info of its
     * own - the game sends one when a session opens, not when a client reattaches to
     * one - so after a page reload there is nothing at all to tell us who we are, and
     * the id has to be recovered from storage instead.
     *
     * The control frame opens every attach, ahead of the replay behind it, so this
     * always lands before any of the output it applies to.
     */
    private handleResume() {
        this.connectedSinceCharInfo = false;
        if (this.current === undefined) {
            this.adoptStoredNum();
        }
    }

    /**
     * Take back the id this life was opened with, which `startNewLife` wrote down and
     * a resumed session has not invalidated. Offered to the room rather than adopted
     * on the spot, because a session resumed mid-transformation is wearing a different
     * object: our own id is always among the room's, so a candidate that is not there
     * is not the body we are in. One that never turns up leaves us unidentified, which
     * is where we would have been anyway - and if it was a transformation, the id comes
     * back when the effect lapses and is adopted then.
     */
    private adoptStoredNum() {
        const stored = Number(characterStorage.get('object_num'));
        if (!Number.isInteger(stored) || stored <= 0) {
            return;
        }
        // The session id is what storage holds whatever body we turn out to be in.
        this.session = stored;
        this.resumeCandidate = stored;
        this.confirmResume(this.lastNums);
    }

    private confirmResume(nums: number[]) {
        if (this.resumeCandidate === undefined || !nums.includes(this.resumeCandidate)) {
            return;
        }
        const num = this.resumeCandidate;
        this.resumeCandidate = undefined;
        this.setNum(num);
    }

    private handleCharInfo(info: GmcpCharInfo) {
        const name = info?.name;
        if (name) {
            characterStorage.setCharacter(name);
        }
        if (info?.gender) {
            characterStorage.set('gender', info.gender);
        }

        const num = info?.object_num;
        if (typeof num === 'undefined') {
            return;
        }

        // A login, or a switch of character over the same connection. Anything else
        // is a new id handed out mid-session, which is a death far more often than a
        // transformation, so it is judged separately below.
        const nameChanged = !!name && !!this.lastName && name !== this.lastName;
        const startsSession = this.connectedSinceCharInfo || nameChanged;
        this.connectedSinceCharInfo = false;
        if (name) {
            this.lastName = name;
        }

        if (startsSession) {
            this.pending = undefined;
            this.startNewLife(num);
        } else if (num !== this.current) {
            this.lastCharInfoNumChange = Date.now();
            this.pending = num;
            setTimeout(() => this.settleNewBody(num), 0);
        }
        // The server placed us; nothing left to guess.
        this.awaiting = undefined;
        this.resumeCandidate = undefined;
        this.setNum(num);
    }

    /**
     * A new life, so the session state that went with the old one is meaningless.
     * Compared against storage rather than the id held in memory because the scope
     * has by now moved to the character being logged in, and `reset` listeners write
     * into that scope - chatHistory clears and persists - so firing it for a character
     * this browser has stored nothing for would wipe what it is about to load.
     */
    private startNewLife(num: number) {
        const stored = characterStorage.get('object_num');
        if (typeof stored !== 'undefined' && String(stored) !== String(num)) {
            this.client.sendEvent('reset');
        }
        characterStorage.set('object_num', String(num));
        this.session = num;
        this.preTransform = undefined;
    }

    /**
     * Decide what a mid-session change of id was. Unless one of the spell messages
     * has just vouched for it, the character died and respawned, and the session
     * goes with the body.
     */
    private settleNewBody(num: number) {
        if (this.pending !== num) {
            return;
        }
        this.pending = undefined;
        if (Date.now() - this.lastTransformMessage < TRANSFORM_WINDOW_MS) {
            return;
        }
        this.startNewLife(num);
    }

    private handleNums(nums: number[]) {
        const list = Array.isArray(nums) ? [...nums] : [];
        this.previousNums = this.lastNums;
        this.lastNums = list;
        this.confirmResume(list);
        if (this.awaiting) {
            this.tryReidentify(list);
        }
    }

    /**
     * The body was swapped. If Char.Info just told us so there is nothing to do;
     * otherwise drop the id - so that everything keyed on the object we no longer
     * are stops acting on it - and work the new one out from the room.
     */
    private handleBodyChanged(expected?: number) {
        if (Date.now() - this.lastCharInfoNumChange < CHAR_INFO_GRACE_MS) {
            return;
        }

        this.preTransform = this.current ?? this.preTransform;
        // The GMCP frame may well have landed before the line that explains it, in
        // which case the list we hold is already the new one and the useful "before"
        // is the one behind it.
        const alreadySwapped = this.current !== undefined && !this.lastNums.includes(this.current);
        this.numsBefore = alreadySwapped ? [...this.previousNums] : [...this.lastNums];
        this.awaiting = {expected, attemptsLeft: REIDENTIFY_ATTEMPTS};
        this.setNum(undefined);
        // Only worth a look right away if the list we hold already describes the
        // room after the swap; otherwise it still shows the body we just left and
        // would hand the dead id straight back.
        if (alreadySwapped) {
            this.tryReidentify(this.lastNums);
        }
    }

    /**
     * Pick our new object out of the room. The transformation happens in place, so
     * everything else standing there is unchanged: our old id is gone and exactly
     * one unfamiliar one has taken its place. Anything less clear-cut than that is
     * left alone.
     */
    private tryReidentify(nums: number[]) {
        const awaiting = this.awaiting;
        if (!awaiting) {
            return;
        }

        if (awaiting.expected !== undefined && nums.includes(awaiting.expected)) {
            this.resolve(awaiting.expected);
            return;
        }

        const old = this.preTransform;
        if (old !== undefined && nums.includes(old)) {
            // The id never actually moved - or it has already come back.
            this.resolve(old);
            return;
        }

        const appeared = nums.filter(n => !this.numsBefore.includes(n));
        if (appeared.length === 1) {
            this.resolve(appeared[0]);
            return;
        }

        if (--awaiting.attemptsLeft <= 0) {
            this.awaiting = undefined;
        }
    }

    private resolve(num: number) {
        this.awaiting = undefined;
        this.setNum(num);
    }

    private setNum(num?: number) {
        if (num === this.current) {
            return;
        }
        this.current = num;
        this.client.sendEvent('player.objectNum', num);
    }
}
