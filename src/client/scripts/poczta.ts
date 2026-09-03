import Client from "../Client";
import eventBus from "@modules/core/eventBus";

export interface MailEntry {
    number: number;
    isRead: boolean;
    subject: string;
    sender: string;
    date: string;
}

export interface LetterContent {
    number: number;
    from: string;
    subject: string;
    to: string;
    cc: string;
    date: string;
    body: string[];
}

export type MailType = 'nieprzeczytane' | 'odebrane' | 'wyslane' | 'niewyslane';

const tag = "poczta";

export default function initPoczta(client: Client, aliases: { pattern: RegExp; callback: Function }[]) {
    let currentMailType: MailType | null = null;
    let currentMails: MailEntry[] = [];
    let pendingEntry: Partial<MailEntry> | null = null;
    let isCapturing = false;
    let popupRequestActive = false;

    let isReadingLetter = false;
    let currentLetter: Partial<LetterContent> | null = null;
    let letterBodyLines: string[] = [];
    let lastHeaderField: 'from' | 'subject' | 'to' | 'cc' | 'date' | null = null;

    /**
     * How long to wait for more of a reply before treating what arrived as all of it.
     * Both the index and a letter are one command's response, so any real gap means the
     * game has stopped talking — and neither has a terminator we can count on (see
     * {@link finishCapturing} and {@link finishReadingLetter}). Without this a listing
     * that never ends leaves the popup spinning forever and the triggers eating output.
     */
    const IDLE_FLUSH_MS = 500;
    /** How long a `listy` request may go unanswered before the popup is told to stop waiting. */
    const REQUEST_TIMEOUT_MS = 5000;
    let listingFlushHandle: ReturnType<typeof setTimeout> | null = null;
    let letterFlushHandle: ReturnType<typeof setTimeout> | null = null;
    let requestTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

    /** The trailing "(prezentowane jest pierwszych 50)" is matched loosely on purpose:
     *  the wording declines with the count, and getting it wrong drops the whole index. */
    const headerPattern = /^Listy (nieprzeczytane|odebrane|wyslane|niewyslane)(?: \([^)]*\))?:$/;
    const entryPattern = /^\s*(\d+)\.\s+(?:(\*R\*)\s+)?Temat: (.+)$/;
    const senderPattern = /^Nadawca: (.+?)(?:\s{2,}(.+))?$/;
    const recipientPattern = /^Odbiorc[ay]: (.+?)(?:\s{2,}(.+))?$/;
    const emptyPattern = /^Nie masz zadnych (nieprzeczytanych |odebranych |wyslanych |niewyslanych )?listow\.$/;

    const letterStartPattern = /^List\s*: ?(\d+)$/;
    const letterFromPattern = /^Od\s*: ?(.+)$/;
    const letterSubjectPattern = /^Temat\s*: ?(.+)$/;
    const letterToPattern = /^Do\s*: ?(.*)$/;
    const letterCcPattern = /^DW\s*: ?(.+)$/;
    const letterDatePattern = /^Data\s*: ?(.+)$/;
    const letterEndPattern = /^\[[\d\-]+ [^\]]+] \(aktualny: \d+\) --$/;
    const letterContinuationPattern = /^\s{2,}(.+)$/;

    const clearListingFlush = () => {
        if (listingFlushHandle) {
            clearTimeout(listingFlushHandle);
            listingFlushHandle = null;
        }
    };

    /** Restarted on every line of the index, so the flush lands once the game goes quiet. */
    const scheduleListingFlush = () => {
        clearListingFlush();
        listingFlushHandle = setTimeout(() => {
            listingFlushHandle = null;
            finishCapturing();
        }, IDLE_FLUSH_MS);
    };

    const clearRequestTimeout = () => {
        if (requestTimeoutHandle) {
            clearTimeout(requestTimeoutHandle);
            requestTimeoutHandle = null;
        }
    };

    /**
     * Last line of defence for the popup's spinner: if the game never prints an index we
     * recognise, report an empty result instead of loading forever. The request is left
     * open on purpose — a reply that only shows up afterwards still captures and emits.
     */
    const scheduleRequestTimeout = () => {
        clearRequestTimeout();
        requestTimeoutHandle = setTimeout(() => {
            requestTimeoutHandle = null;
            if (!isCapturing && popupRequestActive && currentMailType) {
                eventBus.emit("poczta.loaded", {
                    type: currentMailType,
                    mails: [],
                });
            }
        }, REQUEST_TIMEOUT_MS);
    };

    const clearLetterFlush = () => {
        if (letterFlushHandle) {
            clearTimeout(letterFlushHandle);
            letterFlushHandle = null;
        }
    };

    /** Same idea for a letter: the pager prompt normally ends it, but if that line never
     *  matches, the catch-all below would swallow the rest of the session's output. */
    const scheduleLetterFlush = () => {
        clearLetterFlush();
        letterFlushHandle = setTimeout(() => {
            letterFlushHandle = null;
            finishReadingLetter();
        }, IDLE_FLUSH_MS);
    };

    /**
     * The index has no end marker of its own — it stops when the game moves on to
     * something else, or (as a backstop) when the reply goes idle. Both paths land here,
     * so it has to be safe to call more than once: after a request is settled there is
     * nothing left to emit.
     */
    const finishCapturing = () => {
        clearListingFlush();
        clearRequestTimeout();
        if (!popupRequestActive && !isCapturing) {
            return;
        }

        if (pendingEntry && pendingEntry.number !== undefined) {
            if (!pendingEntry.sender) {
                pendingEntry.sender = '';
            }
            if (!pendingEntry.date) {
                pendingEntry.date = '';
            }
            currentMails.push(pendingEntry as MailEntry);
            pendingEntry = null;
        }

        isCapturing = false;
        popupRequestActive = false;

        if (currentMailType) {
            eventBus.emit("poczta.loaded", {
                type: currentMailType,
                mails: [...currentMails],
            });
        }
    };

    const finishReadingLetter = () => {
        clearLetterFlush();
        if (currentLetter && currentLetter.number !== undefined) {
            // Drop the blank padding lines the pager prints around the body so
            // the letter view doesn't open with stray empty rows above/below the
            // text. Internal blanks (paragraph breaks) are preserved.
            const body = [...letterBodyLines];
            while (body.length && body[0].trim() === '') body.shift();
            while (body.length && body[body.length - 1].trim() === '') body.pop();
            currentLetter.body = body;
            eventBus.emit("poczta.letter.loaded", currentLetter as LetterContent);
        }
        isReadingLetter = false;
        currentLetter = null;
        letterBodyLines = [];
        lastHeaderField = null;
    };

    client.Triggers.registerTrigger(headerPattern, (line, matches) => {
        if (!popupRequestActive) return line;

        currentMailType = matches[1] as MailType;
        currentMails = [];
        pendingEntry = null;
        isCapturing = true;
        scheduleListingFlush();
        return null;
    }, tag);

    client.Triggers.registerTrigger(entryPattern, (line, matches) => {
        if (!isCapturing) return line;

        if (pendingEntry && pendingEntry.number !== undefined) {
            if (!pendingEntry.sender) {
                pendingEntry.sender = '';
            }
            if (!pendingEntry.date) {
                pendingEntry.date = '';
            }
            currentMails.push(pendingEntry as MailEntry);
        }

        pendingEntry = {
            number: parseInt(matches[1], 10),
            isRead: !!matches[2],
            subject: matches[3],
        };
        scheduleListingFlush();
        return null;
    }, tag);

    /** Both address lines carry the same trailing date column; which one appears depends
     *  on whether the folder holds received or sent mail. */
    const captureAddressLine = (entry: Partial<MailEntry>, matches: RegExpMatchArray) => {
        entry.sender = matches[1].trim();
        entry.date = matches[2]?.trim() || '';
        scheduleListingFlush();
    };

    client.Triggers.registerTrigger(senderPattern, (line, matches) => {
        if (!isCapturing || !pendingEntry) return line;

        captureAddressLine(pendingEntry, matches);
        return null;
    }, tag);

    client.Triggers.registerTrigger(recipientPattern, (line, matches) => {
        if (!isCapturing || !pendingEntry) return line;

        captureAddressLine(pendingEntry, matches);
        return null;
    }, tag);

    client.Triggers.registerTrigger(emptyPattern, (line) => {
        if (!popupRequestActive) return line;

        currentMails = [];
        pendingEntry = null;
        finishCapturing();
        currentMailType = null;
        return null;
    }, tag);

    /**
     * Ends the index the moment the game prints something that is not part of it. The
     * entry and address triggers above have already consumed their own lines, so
     * anything reaching this point is either padding inside the block (blank lines, and
     * the wrapped tail of a long recipient list, which stays indented) or the start of
     * whatever the game said next.
     */
    client.Triggers.registerTrigger(/^/, (line) => {
        if (!isCapturing) return line;
        if (line.text.trim() === '' || /^\s/.test(line.text)) {
            // Padding or the wrapped tail of the entry being read: hide it along with
            // the rest of that entry, but only while one is open, so an indented line
            // arriving after the index still reaches the output.
            return pendingEntry ? null : line;
        }

        finishCapturing();
        return line;
    }, tag);

    client.Triggers.registerTrigger(letterStartPattern, (line, matches) => {
        if (!isReadingLetter) return line;

        currentLetter = {
            number: parseInt(matches[1], 10),
            to: '',
            cc: '',
        };
        letterBodyLines = [];
        lastHeaderField = null;
        scheduleLetterFlush();
        return null;
    }, tag);

    client.Triggers.registerTrigger(letterFromPattern, (line, matches) => {
        if (!isReadingLetter || !currentLetter) return line;

        currentLetter.from = matches[1].trim();
        lastHeaderField = 'from';
        return null;
    }, tag);

    client.Triggers.registerTrigger(letterSubjectPattern, (line, matches) => {
        if (!isReadingLetter || !currentLetter) return line;

        currentLetter.subject = matches[1].trim();
        lastHeaderField = 'subject';
        return null;
    }, tag);

    client.Triggers.registerTrigger(letterToPattern, (line, matches) => {
        if (!isReadingLetter || !currentLetter) return line;

        currentLetter.to = matches[1].trim();
        lastHeaderField = 'to';
        return null;
    }, tag);

    client.Triggers.registerTrigger(letterCcPattern, (line, matches) => {
        if (!isReadingLetter || !currentLetter) return line;

        currentLetter.cc = matches[1].trim();
        lastHeaderField = 'cc';
        return null;
    }, tag);

    client.Triggers.registerTrigger(letterDatePattern, (line, matches) => {
        if (!isReadingLetter || !currentLetter) return line;

        currentLetter.date = matches[1].trim();
        lastHeaderField = 'date';
        return null;
    }, tag);

    client.Triggers.registerTrigger(letterContinuationPattern, (line, matches) => {
        if (!isReadingLetter || !currentLetter || !lastHeaderField) return line;
        // Only handle continuation during header parsing (before date is fully set or for fields before date)
        if (currentLetter.date && lastHeaderField === 'date') return line;

        const continuation = matches[1].trim();
        if (lastHeaderField === 'to') {
            currentLetter.to = (currentLetter.to || '') + ' ' + continuation;
        } else if (lastHeaderField === 'cc') {
            currentLetter.cc = (currentLetter.cc || '') + ' ' + continuation;
        } else if (lastHeaderField === 'from') {
            currentLetter.from = (currentLetter.from || '') + ' ' + continuation;
        } else if (lastHeaderField === 'subject') {
            currentLetter.subject = (currentLetter.subject || '') + ' ' + continuation;
        }
        return null;
    }, tag);

    client.Triggers.registerTrigger(letterEndPattern, (line) => {
        if (!isReadingLetter) return line;

        finishReadingLetter();
        return null;
    }, tag);

    client.Triggers.registerTrigger(/^/, (line) => {
        if (!isReadingLetter) return line;

        if (!currentLetter) {
            // We've issued `przeczytaj list N` but the "List: N" header hasn't
            // arrived yet. The pager emits blank padding lines here that would
            // otherwise leak into the main game output — swallow them. A
            // non-blank line at this point means the letter isn't loading (e.g.
            // "Nie ma takiego listu."), so stop capturing and let it through.
            if (line.text.trim() === '') return null;
            isReadingLetter = false;
            clearLetterFlush();
            return line;
        }

        if (!currentLetter.date) return null;

        letterBodyLines.push(line.text);
        scheduleLetterFlush();
        return null;
    }, tag);

    aliases.push({
        pattern: /^\/poczta$/,
        callback: () => {
            eventBus.emit("poczta.popup.open");
        },
    });

    eventBus.on("poczta.fetch", (payload: { type: MailType }) => {
        if (payload?.type) {
            currentMailType = payload.type;
            currentMails = [];
            pendingEntry = null;
            isCapturing = false;
            popupRequestActive = true;
            scheduleRequestTimeout();
            eventBus.emit('sendCommand', { command: `listy ${payload.type}`, echo: false });
        }
    });

    eventBus.on("poczta.read", (payload: { number: number }) => {
        if (payload?.number) {
            isReadingLetter = true;
            currentLetter = null;
            letterBodyLines = [];
            eventBus.emit('sendCommand', { command: `przeczytaj list ${payload.number};q`, echo: false });
        }
    });

    return {
        getMails: () => [...currentMails],
    };
}
