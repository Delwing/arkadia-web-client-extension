import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";
import {gmcp} from "../gmcp";
import {getShortDir, longToShort} from "@shared/map";
import {AnsiAwareBuffer} from "../ansi/FormatState";
import {characterStorage} from "@modules/core/storage";
import {defaultSettings} from "@modules/core/defaultSettings";

const SPRING_GREEN = createColorFormat("#00ff7f");
const DIM_GRAY = createColorFormat("#696969");
const RED = createColorFormat("#ff0000");

const VALID_SHORT_DIRS = new Set(Object.values(longToShort));

type Alias = { pattern: RegExp; callback: Function };

export default function initInlineCompassRose(client: Client, aliases?: Alias[]) {
    let exits = new Set<string>();
    let specialExits: string[] = [];
    let backDirs = new Set<string>(); // standard directions leading to previous location
    let backSpecialExits = new Set<string>(); // special exits leading to previous location
    let colorBackExits = false;
    let mode = 0; // 0=off, 1=inline, 2=box, 3=inline-ascii, 4=box-ascii
    let unsubscribeExits: (() => void) | undefined;

    const boxContainer = document.getElementById('compass-rose-box') as HTMLDivElement | null;

    // Click handler for directions and special exits (event delegation). The box
    // outlives the script, so the listener has to go when the script does.
    if (boxContainer) {
        client.scope.listen(boxContainer, 'click', (e) => {
            const target = (e.target as HTMLElement).closest<HTMLElement>('.cr-clickable');
            if (!target) return;
            const dir = target.dataset.dir;
            if (dir) {
                client.sendCommand(dir);
            } else if (target.dataset.exit) {
                client.sendCommand(target.dataset.exit);
            }
        });
    }

    // Compute which exits lead back to the previous location
    client.on("enterLocation", () => {
        backDirs = new Set<string>();
        backSpecialExits = new Set<string>();
        const history = client.Map.locationHistory;
        if (history.length < 2) return;
        const prevId = history[history.length - 2];
        const room = client.Map.currentRoom;
        if (!room) return;
        for (const [dir, id] of Object.entries(room.exits ?? {})) {
            if (id === prevId) {
                const short = getShortDir(dir);
                if (VALID_SHORT_DIRS.has(short)) {
                    backDirs.add(short);
                }
            }
        }
        for (const [exit, id] of Object.entries(room.specialExits ?? {})) {
            if (id === prevId) {
                backSpecialExits.add(exit);
            }
        }
    });

    const listener = () => {
        const data = gmcp?.room?.info;
        const parsed = parseExits(data);
        exits = new Set(parsed.standard);
        specialExits = parsed.special;
        if (mode === 1) {
            showInlineCompassRose();
        } else if (mode === 3) {
            showInlineCompassRoseAscii();
        } else if (mode === 2) {
            updateBoxCompassRose();
        } else if (mode === 4) {
            updateBoxCompassRoseAscii();
        }
    };

    function applySettings(detail: any) {
        // Backward compat: boolean true → 1
        let value = detail?.inlineCompassRose;
        if (value === true) value = 1;
        if (value === false) value = 0;
        setMode(typeof value === 'number' ? value : 0);
        colorBackExits = !!detail?.compassBackExits;
    }

    // Load initial value from storage so the box shows before game login
    const initial = characterStorage.get('settings');
    if (initial) {
        applySettings(initial);
    }

    characterStorage.onChange('settings', (payload) => {
        applySettings(payload ?? defaultSettings);
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
        const isBoxMode = mode === 2 || mode === 4;
        if (!isBoxMode) {
            hideBox();
        }
        if (mode === 2) {
            updateBoxCompassRose();
        } else if (mode === 4) {
            updateBoxCompassRoseAscii();
        }
    }

    function persistMode(newMode: number) {
        setMode(newMode);
        const stored = characterStorage.get('settings') ?? {} as any;
        stored.inlineCompassRose = mode;
        characterStorage.set('settings', stored);
    }

    // --- /roza alias ---
    if (aliases) {
        aliases.push({
            pattern: /^\/roza(?:\s+([01234]))?$/,
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
                    const labels = [
                        "wyl.",
                        "wl. (tryb 1 - inline)",
                        "wl. (tryb 2 - ramka)",
                        "wl. (tryb 3 - inline ascii)",
                        "wl. (tryb 4 - ramka ascii)",
                    ];
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
        buffer.color([0, buffer.length], colorBackExits && backDirs.has(short) ? RED : SPRING_GREEN);
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
            buildLine(hasExit("e") ? "---" : "   ", printExit("e"), "    ", hasExit("d") || hasExit("u") ? "O" : ""),
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
                        const specialExit = specialExits[exitIndex];
                        const exitLabel = specialExit.toUpperCase();
                        const exitBuffer = new AnsiAwareBuffer(exitLabel.padEnd(columnWidth));
                        exitBuffer.color([0, exitLabel.length], colorBackExits && backSpecialExits.has(specialExit) ? RED : SPRING_GREEN);
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

    // --- Mode 3: inline ASCII compass rose (uses "o" instead of direction names) ---

    function printExitAscii(short: string): AnsiAwareBuffer {
        if (!hasExit(short)) {
            return new AnsiAwareBuffer(" ");
        }
        const buffer = new AnsiAwareBuffer("O");
        buffer.color([0, 1], colorBackExits && backDirs.has(short) ? RED : SPRING_GREEN);
        return buffer;
    }

    function showInlineCompassRoseAscii() {
        const lines: AnsiAwareBuffer[] = [
            buildLine("      ", printExitAscii("nw"), " ", printExitAscii("n"), " ", printExitAscii("ne"), "    ", printExitAscii("u")),
            buildLine("       ", hasExit("nw") ? "\\" : " ", hasExit("n") ? "|" : " ", hasExit("ne") ? "/" : " ", "     ", hasExit("u") ? "|" : ""),
            buildLine("      ", printExitAscii("w"), hasExit("w") ? "-" : " "),
            buildLine(hasExit("e") ? "-" : " ", printExitAscii("e"), "    ", hasExit("d") || hasExit("u") ? "O" : ""),
            buildLine("       ", hasExit("sw") ? "/" : " ", hasExit("s") ? "|" : " ", hasExit("se") ? "\\" : " ", "     ", hasExit("d") ? "|" : ""),
            buildLine("      ", printExitAscii("sw"), " ", printExitAscii("s"), " ", printExitAscii("se"), "    ", printExitAscii("d")),
        ];

        const centerX = new AnsiAwareBuffer("O");
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
                        const specialExit = specialExits[exitIndex];
                        const exitLabel = specialExit.toUpperCase();
                        const exitBuffer = new AnsiAwareBuffer(exitLabel.padEnd(columnWidth));
                        exitBuffer.color([0, exitLabel.length], colorBackExits && backSpecialExits.has(specialExit) ? RED : SPRING_GREEN);
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

        // Show grid, hide ascii pre
        const grid = boxContainer.querySelector<HTMLElement>('.compass-rose-grid');
        const asciiPre = boxContainer.querySelector<HTMLElement>('.compass-rose-ascii');
        if (grid) grid.style.display = '';
        if (asciiPre) asciiPre.style.display = 'none';

        // Update direction cells
        const dirs = boxContainer.querySelectorAll<HTMLElement>('.cr-dir');
        dirs.forEach(el => {
            const dir = el.dataset.dir;
            if (dir) {
                const active = hasExit(dir);
                el.classList.toggle('active', active);
                el.classList.toggle('cr-clickable', active);
                el.classList.toggle('cr-back', colorBackExits && active && backDirs.has(dir));
            }
        });

        // Update special exits (on top, growing upward)
        const specialContainer = boxContainer.querySelector('.compass-rose-special-exits');
        if (specialContainer) {
            specialContainer.innerHTML = '';
            specialExits.forEach(exit => {
                const span = document.createElement('span');
                span.className = 'cr-special cr-clickable' + (colorBackExits && backSpecialExits.has(exit) ? ' cr-back' : '');
                span.dataset.exit = exit;
                span.textContent = exit.toUpperCase();
                specialContainer.appendChild(span);
            });
        }
    }

    // --- Mode 4: floating box ASCII compass rose ---

    function updateBoxCompassRoseAscii() {
        if (!boxContainer) return;

        boxContainer.style.display = 'flex';

        // Hide grid, show ascii pre
        const grid = boxContainer.querySelector<HTMLElement>('.compass-rose-grid');
        if (grid) grid.style.display = 'none';

        let pre = boxContainer.querySelector<HTMLPreElement>('.compass-rose-ascii');
        if (!pre) {
            pre = document.createElement('pre');
            pre.className = 'compass-rose-ascii';
            boxContainer.appendChild(pre);
        }
        pre.style.display = '';

        const o = (dir: string) => hasExit(dir)
            ? `<span class="cr-clickable${colorBackExits && backDirs.has(dir) ? ' cr-back' : ''}" data-dir="${dir}">O</span>`
            : ' ';
        const c = (dir: string, ch: string) => hasExit(dir) ? ch : ' '.repeat(ch.length);

        const udPivot = (hasExit('u') || hasExit('d'))
            ? '<span class="cr-ascii-dim">O</span>'
            : ' ';

        pre.innerHTML = [
            `${o('nw')} ${o('n')} ${o('ne')}   ${o('u')}`,
            ` ${c('nw', '\\')}${c('n', '|')}${c('ne', '/')}    ${c('u', '|')}`,
            `${o('w')}${c('w', '-')}<span class="cr-ascii-dim">O</span>${c('e', '-')}${o('e')}   ${udPivot}`,
            ` ${c('sw', '/')}${c('s', '|')}${c('se', '\\')}    ${c('d', '|')}`,
            `${o('sw')} ${o('s')} ${o('se')}   ${o('d')}`,
        ].join('\n');

        // Update special exits
        const specialContainer = boxContainer.querySelector('.compass-rose-special-exits');
        if (specialContainer) {
            specialContainer.innerHTML = '';
            specialExits.forEach(exit => {
                const span = document.createElement('span');
                span.className = 'cr-special cr-clickable' + (colorBackExits && backSpecialExits.has(exit) ? ' cr-back' : '');
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
