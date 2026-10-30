import { Fragment, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import eventBus from "@modules/core/eventBus";
import type { CompassRoseBox } from "@shared/events/clientEvents.ts";
import { useClientEvent } from "@web-ui/hooks";
import { useAppServices } from "../appServices";

const HIDDEN: CompassRoseBox = { view: "hidden", exits: [], backDirs: [], specialExits: [], backSpecialExits: [] };

/** The grid's cells, in reading order; `null` is the centre and `"sep"` the gap under U. */
const GRID: (string | null | "sep")[] = ["nw", "n", "ne", "u", "w", null, "e", "sep", "sw", "s", "se", "d"];

/**
 * The floating compass rose (#compass-rose-box), drawn from what
 * src/client/scripts/inlineCompassRose.ts sends for its box modes. Clicking an
 * open exit walks it.
 */
export function CompassRose() {
    const { client } = useAppServices();
    const [box, setBox] = useState<CompassRoseBox>(HIDDEN);
    useClientEvent<CompassRoseBox>("compassRose.box", (next) => setBox(next ?? HIDDEN));
    // Mounted after the scripts started: ask for what they already sent.
    useEffect(() => { eventBus.emit("requestCompassRose"); }, []);

    const has = (dir: string) => box.exits.includes(dir);
    const back = (dir: string) => box.backDirs.includes(dir);

    const onClick = (e: MouseEvent<HTMLDivElement>) => {
        const target = (e.target as HTMLElement).closest<HTMLElement>(".cr-clickable");
        if (!target) return;
        const command = target.dataset.dir ?? target.dataset.exit;
        if (command) client.sendCommand(command);
    };

    // ASCII: an open exit is an O that walks it, a closed one a blank.
    const o = (dir: string): ReactNode => has(dir)
        ? <span className={back(dir) ? "cr-clickable cr-back" : "cr-clickable"} data-dir={dir}>O</span>
        : " ";
    const c = (dir: string, ch: string) => has(dir) ? ch : " ".repeat(ch.length);
    const dim = <span className="cr-ascii-dim">O</span>;
    const ascii: ReactNode[][] = [
        [o("nw"), " ", o("n"), " ", o("ne"), "   ", o("u")],
        [" ", c("nw", "\\"), c("n", "|"), c("ne", "/"), "    ", c("u", "|")],
        [o("w"), c("w", "-"), dim, c("e", "-"), o("e"), "   ", has("u") || has("d") ? dim : " "],
        [" ", c("sw", "/"), c("s", "|"), c("se", "\\"), "    ", c("d", "|")],
        [o("sw"), " ", o("s"), " ", o("se"), "   ", o("d")],
    ];

    return (
        <div id="compass-rose-box" className="compass-rose-box" style={{ display: box.view === "hidden" ? "none" : "flex" }} onClick={onClick}>
            {/* Special exits on top, growing upward. */}
            <div className="compass-rose-special-exits">
                {box.specialExits.map((exit) => (
                    <span
                        key={exit}
                        className={box.backSpecialExits.includes(exit) ? "cr-special cr-clickable cr-back" : "cr-special cr-clickable"}
                        data-exit={exit}
                    >
                        {exit.toUpperCase()}
                    </span>
                ))}
            </div>
            <div className="compass-rose-grid" style={box.view === "ascii" ? { display: "none" } : undefined}>
                {GRID.map((cell, i) => {
                    if (cell === null) return <span key={i} className="cr-center">X</span>;
                    if (cell === "sep") return <span key={i} className="cr-sep"></span>;
                    const open = has(cell);
                    const classes = ["cr-dir", (cell === "u" || cell === "d") && "cr-ud", open && "active cr-clickable", open && back(cell) && "cr-back"];
                    return (
                        <span key={i} className={classes.filter(Boolean).join(" ")} data-dir={cell}>
                            {cell.toUpperCase()}
                        </span>
                    );
                })}
            </div>
            {box.view === "ascii" && (
                <pre className="compass-rose-ascii">
                    {ascii.map((line, i) => (
                        <Fragment key={i}>{i > 0 && "\n"}{line.map((part, j) => <Fragment key={j}>{part}</Fragment>)}</Fragment>
                    ))}
                </pre>
            )}
        </div>
    );
}
