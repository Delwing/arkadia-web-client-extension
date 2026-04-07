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

    const headerPattern = /^Listy (nieprzeczytane|odebrane|wyslane|niewyslane)(?: \(prezentowane jest pierwsz[eay] \d+\))?:$/;
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

    const finishCapturing = () => {
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
        if (currentLetter && currentLetter.number !== undefined) {
            currentLetter.body = [...letterBodyLines];
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
        return null;
    }, tag);

    client.Triggers.registerTrigger(senderPattern, (line, matches) => {
        if (!isCapturing || !pendingEntry) return line;

        pendingEntry.sender = matches[1].trim();
        pendingEntry.date = matches[2]?.trim() || '';

        if (pendingEntry.number === 1) {
            finishCapturing();
        }
        return null;
    }, tag);

    client.Triggers.registerTrigger(recipientPattern, (line, matches) => {
        if (!isCapturing || !pendingEntry) return line;

        pendingEntry.sender = matches[1].trim();
        pendingEntry.date = matches[2]?.trim() || '';

        if (pendingEntry.number === 1) {
            finishCapturing();
        }
        return null;
    }, tag);

    client.Triggers.registerTrigger(emptyPattern, (line) => {
        if (!popupRequestActive) return line;

        currentMails = [];
        popupRequestActive = false;
        eventBus.emit("poczta.loaded", {
            type: currentMailType,
            mails: [],
        });
        currentMailType = null;
        return null;
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
        if (!isReadingLetter || !currentLetter) return line;
        if (!currentLetter.date) return null;

        letterBodyLines.push(line.text);
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
