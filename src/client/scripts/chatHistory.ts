import Client from "../Client";
import { AnsiAwareBuffer, BufferSegment } from "../ansi/FormatState";
import { createColorFormat } from "@modules/core/Colors";
import { characterStorage } from "@modules/core/storage";
import eventBus from "@modules/core/eventBus";

const HISTORY_LIMIT = 100;
const PRINT_LIMIT = 20;
const TIMESTAMP_COLOR = createColorFormat("#ffffff");
const STORAGE_KEY = "chat_history";

export type ChatEntry = {
    timestamp: string;
    buffer: AnsiAwareBuffer;
    isTeamMember: boolean;
};

type SerializedChatEntry = {
    timestamp: string;
    segments: BufferSegment[];
    isTeamMember: boolean;
};

// Exported history for use by ChatPopup
let chatHistory: ChatEntry[] = [];

export function getChatHistory(): ChatEntry[] {
    return chatHistory;
}

export default function initChatHistory(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    /** The character the in-memory history belongs to; see loadFromStorage. */
    let loadedCharacter: string | null = null;

    function formatTimestamp(date: Date) {
        return date.toLocaleTimeString("pl-PL", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    }

    function checkIfTeamMember(text: string): boolean {
        const teamManager = client.TeamManager;
        if (!teamManager) return false;

        const members = teamManager.getTeamMembers();
        if (members.length === 0) return false;

        const trimmedText = text.trim();

        // Own speech counts as team when in a team
        if (trimmedText.startsWith("Mowisz") || trimmedText.startsWith("Krzyczysz") || trimmedText.startsWith("Szepczesz")) {
            return true;
        }

        // Check if message starts with a team member's name
        // Messages from team members typically start with their name
        for (const member of members) {
            if (trimmedText.startsWith(member)) {
                return true;
            }
        }
        return false;
    }

    function addEntry(buffer: AnsiAwareBuffer) {
        const isTeamMember = checkIfTeamMember(buffer.text);
        const entry: ChatEntry = {
            timestamp: formatTimestamp(new Date()),
            buffer: buffer.clone(),
            isTeamMember,
        };
        chatHistory.push(entry);
        if (chatHistory.length > HISTORY_LIMIT) {
            chatHistory.shift();
        }
        // Notify popup of new message
        eventBus.emit("chat.newMessage", entry);
    }

    function serializeHistory(): SerializedChatEntry[] {
        return chatHistory.map(entry => ({
            timestamp: entry.timestamp,
            segments: entry.buffer.getSegments(),
            isTeamMember: entry.isTeamMember,
        }));
    }

    function deserializeHistory(data: SerializedChatEntry[]): ChatEntry[] {
        return data.map(entry => ({
            timestamp: entry.timestamp,
            buffer: new AnsiAwareBuffer(entry.segments),
            isTeamMember: entry.isTeamMember,
        }));
    }

    function loadHistory(data: unknown) {
        if (!Array.isArray(data)) {
            chatHistory = [];
            return;
        }
        try {
            chatHistory = deserializeHistory(data as SerializedChatEntry[]);
        } catch {
            chatHistory = [];
        }
    }

    function persistHistory() {
        // Never write one character's messages into another character's scope. On a
        // switch the scope moves first (setCharacter, from the same Char.Info),
        // 'reset' then empties what belongs to the character being left, and only
        // afterwards is the arriving one loaded - so an unguarded write here would
        // destroy the history it is about to read.
        if (loadedCharacter !== null && loadedCharacter !== characterStorage.getCharacter()) {
            return;
        }
        characterStorage.set(STORAGE_KEY, serializeHistory());
    }

    function resetHistory() {
        chatHistory = [];
        persistHistory();
        eventBus.emit("chat.cleared");
    }

    /**
     * Take over the history of whichever character the scope now names. Does nothing
     * when that is already the character in memory: Char.Info is re-sent within a
     * session - przeobrazenie and the appearance scrolls do it - and what is in memory
     * is then newer than the copy in storage, which is only written on reset and on
     * unload. What it must not do is leave the previous character's messages standing
     * when the new one has none of its own.
     */
    function loadFromStorage() {
        const character = characterStorage.getCharacter();
        if (character === loadedCharacter) {
            return;
        }
        loadedCharacter = character;
        chatHistory = [];
        const stored = characterStorage.get(STORAGE_KEY);
        if (stored) {
            loadHistory(stored);
        }
    }

    function printHistory() {
        if (!chatHistory.length) {
            client.print("Brak zapisanych wiadomosci czatu.");
            return;
        }
        const output = new AnsiAwareBuffer();
        // Only print last PRINT_LIMIT entries for /chat command
        const startIndex = Math.max(0, chatHistory.length - PRINT_LIMIT);
        const entries = chatHistory.slice(startIndex);
        entries.forEach((entry, index) => {
            if (index > 0) {
                output.append("\n");
            }
            output.append(`[${entry.timestamp}] `, TIMESTAMP_COLOR);
            output.appendBuffer(entry.buffer);
        });
        client.print(output);
    }

    // Load from storage when character info is received (character scope is set)
    client.on("gmcp.char.info", () => {
        loadFromStorage();
    });

    // Reset on character change
    client.on("reset", () => {
        resetHistory();
    });

    // Persist on page unload
    window.addEventListener("beforeunload", persistHistory);

    function handleChatMessage(buffer: AnsiAwareBuffer) {
        if (!(buffer instanceof AnsiAwareBuffer) || !buffer.text.trim()) return;

        // Split multiline messages into separate history entries
        const lines = buffer.splitLines();
        lines.forEach(line => {
            if (line.text.trim()) {
                addEntry(line);
            }
        });
    }

    client.on("gmcp_msg.comm", handleChatMessage);
    client.on("gmcp_msg.emote", handleChatMessage);

    function openPopup() {
        eventBus.emit("chat.popup.open");
    }

    if (aliases) {
        aliases.push({ pattern: /^\/chat$/, callback: printHistory });
        aliases.push({ pattern: /^\/chat okno$/, callback: openPopup });
        aliases.push({ pattern: /^\/chatw$/, callback: openPopup });
    }
}
