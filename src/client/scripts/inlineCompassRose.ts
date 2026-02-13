import Client from "../Client";
import { createColorFormat } from "@modules/core/Colors";
import { gmcp } from "../gmcp";
import { getShortDir, longToShort } from "@shared/map";
import { AnsiAwareBuffer } from "../ansi/FormatState";
import { getItemSync, setItemSync } from "@modules/core/storage";

const SPRING_GREEN = createColorFormat("#00ff7f");
const DIM_GRAY = createColorFormat("#696969");

const VALID_SHORT_DIRS = new Set(Object.values(longToShort));

type Alias = { pattern: RegExp; callback: Function };

export default function initInlineCompassRose(client: Client, aliases?: Alias[]) {
    let exits = new Set<string>();
    let specialExits: string[] = [];
    let mode = 0; // 0=off, 1=inline, 2=box
    let unsubscribeExits: (() => void) | undefined;

    const boxContainer = document.getElementById('compass-rose-box') as HTMLDivElement | null;

    // Click handler for directions and special exits (event delegation)
    boxContainer?.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement).closest<HTMLElement>('.cr-clickable');
        if (!target) return;
        const dir = target.dataset.dir;
        if (dir) {
            client.sendCommand(dir);
        } else if (target.dataset.exit) {
            client.sendCommand(target.dataset.exit);
        }
    });

    const listener = () => {
        const data = gmcp?.room?.info;
        const parsed = parseExits(data);
        exits = new Set(parsed.standard);
        specialExits = parsed.special;
        if (mode === 1) {
            showInlineCompassRose();
        } else if (mode === 2) {
            updateBoxCompassRose();
        }
    };

    function applySettingsValue(value: unknown) {
        // Backward compat: boolean true → 1
        if (value === true) value = 1;
        if (value === false) value = 0;
        setMode(typeof value === 'number' ? value : 0);
    }

    // Load initial value from storage so the box shows before game login
    const initial = getItemSync('settings')?.settings;
    if (initial) {
        applySettingsValue(initial.inlineCompassRose);
    }

    client.on("settings", (payload) => {
        const detail = (payload ?? {}) as Record<string, unknown>;
        applySettingsValue(detail.inlineCompassRose);
    });

    function setMode(newMode: number) {
        if (newMode === mode) return;
        const wasSubscribed = mode > 0;
        mode = newMode;
        if (mode > 0 && !wasSubscribed) {
            unsubscribeExits = client.on("gmcp_msg.room.exits", () => listener());
        } else if (mode === 0 && wasSubscribed) {
            unsubscribeExits?.();
            unsubscribeExits = undefined;
        }
        if (mode !== 2) {
            hideBox();
        }
        if (mode === 2) {
            updateBoxCompassRose();
        }
    }

    function persistMode(newMode: number) {
        setMode(newMode);
        const stored = getItemSync('settings')?.settings ?? {};
        stored.inlineCompassRose = mode;
        setItemSync('settings', stored);
    }

    // --- /roza alias ---
    if (aliases) {
        aliases.push({
            pattern: /^\/roza(?:\s+([012]))?$/,
            callback: (m: RegExpMatchArray) => {
                const arg = m[1];
                if (arg === undefined) {
                    // Toggle: off → last mode (default 1), on → off
                    if (mode > 0) {
                        persistMode(0);
                        client.println("Roza wiatrow: wyl.");
                    } else {
                        persistMode(1);
                        client.println("Roza wiatrow: wl. (tryb 1 - inline)");
                    }
                } else {
                    const n = Number(arg);
                    persistMode(n);
                    const labels = ["wyl.", "wl. (tryb 1 - inline)", "wl. (tryb 2 - ramka)"];
                    client.println(`Roza wiatrow: ${labels[n]}`);
                }
            },
        });
    }

    // --- Shared exit parsing ---

    function parseExits(detail: any): { standard: string[]; special: string[] } {
        let list: string[] = [];
        if (!detail) return { standard: [], special: [] };
        if (Array.isArray(detail)) {
            list = detail;
        } else if (Array.isArray(detail.exits)) {
            list = detail.exits;
        } else if (detail.exits && typeof detail.exits === "object") {
            list = Object.keys(detail.exits);
        } else if (detail.room && detail.room.exits) {
            const e = detail.room.exits;
            list = Array.isArray(e) ? e : Object.keys(e);
        }

        const standard: string[] = [];
        const special: string[] = [];

        list.forEach((exit) => {
            const shortDir = getShortDir(exit);
            if (VALID_SHORT_DIRS.has(shortDir)) {
                standard.push(shortDir);
            } else {
                special.push(exit);
            }
        });

        return { standard, special };
    }

    function hasExit(short: string): boolean {
        return exits.has(short);
    }

    // --- Mode 1: inline text compass rose ---

    function printExit(short: string): AnsiAwareBuffer {
        if (!hasExit(short)) {
            return new AnsiAwareBuffer(" ".repeat(short.length));
        }
        const buffer = new AnsiAwareBuffer(short.toUpperCase());
        buffer.color([0, buffer.length], SPRING_GREEN);
        return buffer;
    }

    function buildLine(...parts: Array<string | AnsiAwareBuffer>): AnsiAwareBuffer {
        const line = new AnsiAwareBuffer();
        for (const part of parts) {
            if (typeof part === "string") {
                line.append(part, {});
            } else {
                line.appendBuffer(part);
            }
        }
        return line;
    }

    function showInlineCompassRose() {
        const lines: AnsiAwareBuffer[] = [
            buildLine("       ", printExit("nw"), "  ", printExit("n"), "  ", printExit("ne"), "    ", printExit("u")),
            buildLine("         ", hasExit("nw") ? "\\" : " ", " ", hasExit("n") ? "|" : " ", " ", hasExit("ne") ? "/" : " ", "      ", hasExit("u") ? "|" : ""),
            buildLine("       ", printExit("w"), hasExit("w") ? "---" : "   "),
            buildLine(hasExit("e") ? "---" : "   ", printExit("e"), "    ", hasExit("d") || hasExit("u") ? "o" : ""),
            buildLine("         ", hasExit("sw") ? "/" : " ", " ", hasExit("s") ? "|" : " ", " ", hasExit("se") ? "\\" : " ", "      ", hasExit("d") ? "|" : ""),
            buildLine("       ", printExit("sw"), "  ", printExit("s"), "  ", printExit("se"), "    ", printExit("d")),
        ];

        const centerX = new AnsiAwareBuffer("X");
        centerX.color([0, 1], DIM_GRAY);
        lines[2].appendBuffer(centerX);
        lines[2].appendBuffer(lines[3]);

        if (specialExits.length > 0) {
            const exitLines = [0, 2, 4];
            const baseLength = Math.max(...exitLines.map(i => lines[i].length));

            let exitIndex = 0;

            while (exitIndex < specialExits.length) {
                const columnExits: string[] = [];
                for (let i = 0; i < exitLines.length && exitIndex + i < specialExits.length; i++) {
                    columnExits.push(specialExits[exitIndex + i].toUpperCase());
                }
                const columnWidth = Math.max(...columnExits.map(e => e.length));

                for (let i = 0; i < exitLines.length; i++) {
                    const lineIdx = exitLines[i];
                    const currentLength = lines[lineIdx].length;
                    if (currentLength < baseLength) {
                        lines[lineIdx].append(" ".repeat(baseLength - currentLength));
                    }

                    if (exitIndex < specialExits.length) {
                        const specialExit = specialExits[exitIndex].toUpperCase();
                        const exitBuffer = new AnsiAwareBuffer(specialExit.padEnd(columnWidth));
                        exitBuffer.color([0, specialExit.length], SPRING_GREEN);
                        lines[lineIdx].append("    ");
                        lines[lineIdx].appendBuffer(exitBuffer);
                        exitIndex++;
                    } else {
                        lines[lineIdx].append("    " + " ".repeat(columnWidth));
                    }
                }
            }
        }

        const output = new AnsiAwareBuffer();
        for (let i = 0; i < lines.length; i++) {
            if (i === 3) continue;
            const line = lines[i];
            if (line.text.trim().length > 0) {
                if (output.length > 0) {
                    output.append("\n");
                }
                output.appendBuffer(line);
            }
        }

        client.println(output);
    }

    // --- Mode 2: floating box compass rose ---

    function updateBoxCompassRose() {
        if (!boxContainer) return;

        boxContainer.style.display = 'flex';

        // Update direction cells
        const dirs = boxContainer.querySelectorAll<HTMLElement>('.cr-dir');
        dirs.forEach(el => {
            const dir = el.dataset.dir;
            if (dir) {
                const active = hasExit(dir);
                el.classList.toggle('active', active);
                el.classList.toggle('cr-clickable', active);
            }
        });

        // Update special exits (on top, growing upward)
        const specialContainer = boxContainer.querySelector('.compass-rose-special-exits');
        if (specialContainer) {
            specialContainer.innerHTML = '';
            specialExits.forEach(exit => {
                const span = document.createElement('span');
                span.className = 'cr-special cr-clickable';
                span.dataset.exit = exit;
                span.textContent = exit.toUpperCase();
                specialContainer.appendChild(span);
            });
        }
    }

    function hideBox() {
        if (boxContainer) {
            boxContainer.style.display = 'none';
        }
    }
}
