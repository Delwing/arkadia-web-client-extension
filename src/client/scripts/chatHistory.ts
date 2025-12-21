import Client from "../Client";
import { AnsiAwareBuffer } from "../ansi/FormatState";
import { createColorFormat } from "@modules/core/Colors";
import eventBus from "@modules/core/eventBus";

const HISTORY_LIMIT = 100;
const PRINT_LIMIT = 20;
const TIMESTAMP_COLOR = createColorFormat("#ffffff");

export type ChatEntry = {
    timestamp: string;
    buffer: AnsiAwareBuffer;
    isTeamMember: boolean;
};

// Exported history for use by ChatPopup
let chatHistory: ChatEntry[] = [];

export function getChatHistory(): ChatEntry[] {
    return chatHistory;
}

export default function initChatHistory(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
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

        // Check if message starts with a team member's name
        // Messages from team members typically start with their name
        const trimmedText = text.trim();
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

    client.on("gmcp_msg.comm", (buffer) => {
        if (!(buffer instanceof AnsiAwareBuffer) || !buffer.text.trim()) return;

        // Split multiline messages into separate history entries
        const lines = buffer.splitLines();
        lines.forEach(line => {
            if (line.text.trim()) {
                addEntry(line);
            }
        });
    });

    client.on("client.disconnect", () => {
        chatHistory = [];
        eventBus.emit("chat.cleared");
    });

    function openPopup() {
        eventBus.emit("chat.popup.open");
    }

    if (aliases) {
        aliases.push({ pattern: /^\/chat$/, callback: printHistory });
        aliases.push({ pattern: /^\/chat okno$/, callback: openPopup });
        aliases.push({ pattern: /^\/chatw$/, callback: openPopup });
    }
}
