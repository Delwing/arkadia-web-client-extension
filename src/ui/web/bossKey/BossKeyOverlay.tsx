import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type Client from "@client/Client";
import eventBus from "@modules/core/eventBus";
import { readableTextOf } from "@shared/dom/outputText";
import { getActiveCommandLine } from "@web/commandInput/activeCommandLine";
import { useClientEvent } from "../hooks";
import { isBossKeyActive, isPanicKey, onBossKeyChange, setBossKeyActive, toggleBossKey } from "./bossKeyState";
import { installTitleDisguise, muteForOverlay, type SoundControl, unmuteAfterOverlay } from "./disguise";
import { mountMapFigure } from "./bossKeyMap";
import { buildDocumentBlocks, type LogLine, pushLine } from "./documentLog";
import { fatigueToZoom, HP_PAGES, hpToPage, plotVitals, zoomToSliderPosition } from "./vitals";
import * as S from "./chrome";
import "./bossKey.css";

interface CharStateLike {
    hp?: number;
    fatigue?: number;
}

export interface BossKeyOverlayProps {
    /** Source of the nearby-object list shown in the Navigation pane. */
    client: Client;
    /**
     * Muted while the overlay is up, restored on dismiss. Pass
     * `client.SoundManager`; omit it and sounds keep playing.
     */
    soundControl?: SoundControl | null;
    /**
     * Called to freeze the game's `document.title` writes. The stock UI passes
     * `suppressTitleUpdates` from `FightTitle`; UIs that never touch the title
     * can leave it out.
     */
    suppressTitle?: (suppressed: boolean) => void;
}

/**
 * A panic button: covers the entire client with a Word window.
 *
 * Pause or ScrollLock raises it, the same keys or Escape dismiss it. The game
 * keeps running underneath completely untouched --- this only draws over the
 * page, mutes sound, and takes over the tab title and favicon --- so nothing is
 * missed while it is up.
 *
 * Vitals stay readable, disguised as Word's own status-bar numbers: HP is the
 * page number ("Strona 5 z 7", which is exactly the 1..7 HP scale) and fatigue
 * is the zoom level. See `vitals.ts`.
 *
 * You can also keep PLAYING: the last line of the document is a real (borderless)
 * input, so typing looks like writing the next paragraph and Enter sends it.
 *
 * It does not own a command line -- it BORROWS the UI's one, through
 * `activeCommandLine`. So history, prefix auto-complete, Tab completion and
 * password mode are the real ones rather than a second copy, and commands sent
 * from here are echoed to the regular output and session log exactly like any
 * other, keeping the transcript complete. The echo is filtered out of the
 * document itself (see the message handler) so the page stays clean.
 *
 * Rendered through a portal to `document.body` so it sits above the dock grid,
 * popups and every other bit of client chrome regardless of where it is mounted.
 */
export default function BossKeyOverlay({ client, soundControl, suppressTitle }: BossKeyOverlayProps) {
    const [active, setActive] = useState(isBossKeyActive);
    const [vitals, setVitals] = useState<CharStateLike>({});
    // Whatever had focus when the overlay went up, so dismissing gives the
    // command line (or wherever the player was) its caret back.
    const restoreFocus = useRef<HTMLElement | null>(null);
    // The transcript is captured into a ref at all times but only rendered
    // while the overlay is up: collecting must never cost the hidden client a
    // re-render, and the buffer has to be warm the instant the key is hit.
    const linesRef = useRef<LogLine[]>([]);
    const [revision, setRevision] = useState(0);
    const pendingFrame = useRef<number | null>(null);
    const pageRef = useRef<HTMLDivElement>(null);
    const composerRef = useRef<HTMLInputElement>(null);
    const mapFigureRef = useRef<HTMLDivElement>(null);
    // The game is asking for a password. Despite the `serverEchoing` parameter
    // name on the event, the payload is already "echo suppressed" -- i.e. it IS
    // the password flag, and both existing UIs pass it straight through
    // (main.ts's setPasswordMode, forge's useCommandLine). Do not negate it:
    // EchoHandler.reset() fires false on connect, so a negated value would mask
    // the field from connect onward and never unmask.
    const [passwordMode, setPasswordMode] = useState(false);

    useClientEvent<CharStateLike>("gmcp.char.state", (state) => {
        setVitals((prev) => ({ ...prev, ...state }));
    });

    useClientEvent<boolean>("telnet.echo", (echoSuppressed) => setPasswordMode(!!echoSuppressed));

    // Nearby objects, for the Navigation pane. Read from `ObjectManager` --
    // the same source the real object list renders from -- rather than
    // accumulating the raw GMCP packets here. The manager already merges
    // nums with data, tracks the player, and categorises team vs. rest; a
    // second copy of that would only drift. These are exactly the events
    // ObjectList re-renders on.
    useEffect(() => {
        const bump = () => {
            if (!isBossKeyActive()) return;
            setRevision((value) => value + 1);
        };
        const offs = [
            eventBus.on("gmcp.objects.nums", bump),
            eventBus.on("gmcp.objects.data", bump),
            eventBus.on("gmcp.char.state", bump),
        ];
        return () => offs.forEach((off) => off());
    }, []);

    useEffect(() => onBossKeyChange(setActive), []);

    useEffect(() => {
        const off = eventBus.on("message", (message, type) => {
            if (message === undefined || message === null) return;
            // Commands ARE echoed (so the real output and the session log stay
            // complete), but the echo is kept out of the document: a line
            // reading "-> polnoc" in the middle of a report is the most
            // conspicuous thing that could appear on the page. `echoCommand`
            // tags these 'command'.
            if (type === "command") return;
            pushLine(linesRef.current, { text: readableTextOf(message), type });
            if (!isBossKeyActive()) return;
            // Output arrives in bursts; coalesce a burst into one repaint.
            if (pendingFrame.current !== null) return;
            pendingFrame.current = requestAnimationFrame(() => {
                pendingFrame.current = null;
                setRevision((value) => value + 1);
            });
        });
        return () => {
            off();
            if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current);
            pendingFrame.current = null;
        };
    }, []);

    // One capture-phase listener, always installed: it has to see the panic key
    // before the command input or any bind handler does.
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (isPanicKey(event.key)) {
                event.preventDefault();
                event.stopPropagation();
                toggleBossKey();
                return;
            }
            if (!isBossKeyActive()) return;
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setBossKeyActive(false);
                return;
            }
            // Typing is for the composer, and only the composer. Its own keys
            // pass through untouched (the input needs them, and the shared
            // `shouldIgnoreGlobalKeybind` already stands the bind system down
            // for a focused non-command text field). Anything aimed anywhere
            // else is swallowed, so nothing reaches the client behind the
            // overlay or lands in the real command line on dismiss.
            if (event.target === composerRef.current) return;
            event.preventDefault();
            event.stopPropagation();
        };
        // keypress/keyup are swallowed too so nothing slips through as a pair.
        const swallow = (event: KeyboardEvent) => {
            if (!isBossKeyActive() || isPanicKey(event.key)) return;
            if (event.target === composerRef.current) return;
            event.preventDefault();
            event.stopPropagation();
        };
        document.addEventListener("keydown", onKeyDown, true);
        document.addEventListener("keypress", swallow, true);
        document.addEventListener("keyup", swallow, true);
        return () => {
            document.removeEventListener("keydown", onKeyDown, true);
            document.removeEventListener("keypress", swallow, true);
            document.removeEventListener("keyup", swallow, true);
        };
    }, []);

    useEffect(() => {
        if (active) {
            const focused = document.activeElement;
            restoreFocus.current = focused instanceof HTMLElement ? focused : null;
            restoreFocus.current?.blur();
            muteForOverlay(soundControl);
            // Take the command line in a clean state. The engine leaves its
            // history browse position mid-ring after a submit, so without this
            // the first ArrowUp here would already be at the end of history.
            getActiveCommandLine()?.reset();
            // Land the caret in the document so you can just start typing.
            composerRef.current?.focus();
        } else {
            unmuteAfterOverlay(soundControl);
            // The borrowed command line was staged with our text; hand it back empty.
            getActiveCommandLine()?.reset();
            restoreFocus.current?.focus();
            restoreFocus.current = null;
        }
    }, [active, soundControl]);

    // Spawn the figure map while the overlay is up and tear it down after.
    // Its own renderer, so nothing here touches the live map (see bossKeyMap).
    useEffect(() => {
        if (!active) return;
        const frame = mapFigureRef.current;
        if (!frame) return;
        return mountMapFigure(frame);
    }, [active]);

    // The tab claims to be a Word document for the WHOLE session, not just while
    // the overlay is up -- see disguise.ts for why. This is what makes the panic
    // key instant and silent: there is no title to flip when it is pressed, and
    // nothing reading "Arkadia" for anyone who glanced over beforehand.
    useEffect(() => installTitleDisguise(suppressTitle), [suppressTitle]);

    // Never leave the client muted if the host unmounts mid-panic.
    useEffect(() => () => unmuteAfterOverlay(soundControl), [soundControl]);


    // Nearby objects as Navigation-pane entries, nested into an outline.
    //
    // GMCP's `attack_num` on an object is the id of whatever it is fighting, so
    // the objects around you form a "who is fighting whom" tree. That maps
    // exactly onto what the pane already is -- headings with sub-headings -- so
    // attackers are listed indented under whoever they are attacking, and each
    // one appears once: at the top level, or beneath its target if that target
    // is also in the room. Your own attack target keeps the "current heading"
    // treatment on top of that.
    const navEntries = useMemo(() => {
        if (!active) return [];
        const objects = client.ObjectManager?.getObjectsOnLocation?.() ?? [];
        const entries = objects
            .filter((obj) => typeof obj.desc === "string" && obj.desc.trim() !== "")
            .map((obj) => ({
                num: obj.num,
                desc: obj.desc as string,
                target: obj.attack_target === true,
                // The object list's own targeting shortcut. Rendered as an
                // outline number, which is what a numbered heading in a
                // document's contents looks like anyway -- so it costs nothing
                // in disguise and makes the entries directly actionable.
                shortcut: typeof obj.shortcut === "string" && obj.shortcut !== "" ? obj.shortcut : null,
                // Object hp is the same 0..6 GMCP scale as the player's, shown
                // as 1..7 (objectList's hpLevelOf), so the very same page-number
                // disguise works: an outline entry with a number after it reads
                // as a table of contents.
                page: typeof obj.hp === "number" ? hpToPage(obj.hp) : null,
                team: obj.__category === "team",
                self: obj.__category === "player",
                fighting: typeof obj.attack_num === "number" ? obj.attack_num : null,
                sub: false,
            }));

        // Who is attacking whom. Every object stays a top-level entry and simply
        // gains a sub-line naming its attackers by shortcut. Restructuring the
        // list into a real tree was tried and is the wrong shape for this data:
        // combat is mutual, so the entries reference each other in cycles and
        // whole objects fell out of the outline.
        const shortcutOf = new Map(entries.map((entry) => [entry.num, entry.shortcut]));
        const attackersOf = new Map<number, string[]>();
        for (const entry of entries) {
            const victim = entry.fighting;
            if (victim === null || victim === entry.num || !shortcutOf.has(victim)) continue;
            const code = entry.shortcut ?? "?";
            const list = attackersOf.get(victim);
            if (list) list.push(code);
            else attackersOf.set(victim, [code]);
        }

        return entries.map((entry) => ({
            ...entry,
            sub: entry.team,
            attackers: attackersOf.get(entry.num) ?? [],
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- ObjectManager is mutable; revision tracks it
    }, [active, revision, client]);

    // `revision` is the repaint signal for the mutable line buffer.
    const blocks = useMemo(
        () => (active ? buildDocumentBlocks(linesRef.current) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- linesRef is mutated in place; revision tracks it
        [active, revision],
    );

    // A document sits at its insertion point, so the page stays pinned to the
    // newest text. Layout effect, so it never paints mid-scroll.
    useLayoutEffect(() => {
        const body = pageRef.current;
        if (body) body.scrollTop = body.scrollHeight;
    }, [active, revision, blocks.length]);


    if (!active) return null;

    const chartBars = plotVitals(vitals as Record<string, number | undefined>);
    const page = hpToPage(vitals.hp);
    const zoom = fatigueToZoom(vitals.fatigue);
    const knob = zoomToSliderPosition(zoom);
    const statusPage = S.STATUS_PAGE.replace("{0}", String(page)).replace("{1}", String(HP_PAGES));

    return createPortal(
        <div className="bosskey" onContextMenu={(event) => event.preventDefault()}>
            <div className="bk-titlebar">
                <div className="bk-qat">
                    <span className="bk-word-badge">W</span>
                    <span className="bk-autosave">
                        <span className="bk-toggle" />
                        {S.AUTOSAVE}
                    </span>
                    <span className="bk-qat-icon bk-i-save" />
                    <span className="bk-qat-icon bk-i-undo" />
                    <span className="bk-qat-icon bk-i-redo" />
                </div>
                <div className="bk-doc-name">
                    {S.APP_TITLE} <span className="bk-saved">- {S.SAVED_STATE}</span>
                </div>
                <div className="bk-window-buttons">
                    <span className="bk-min" />
                    <span className="bk-max" />
                    <span className="bk-close" />
                </div>
            </div>

            <div className="bk-tabs">
                {S.TABS.map((tab, index) => (
                    <span
                        key={tab}
                        className={"bk-tab" + (index === 0 ? " file" : "") + (index === 1 ? " active" : "")}
                    >
                        {tab}
                    </span>
                ))}
                <span className="bk-search">{S.SEARCH_PLACEHOLDER}</span>
            </div>

            <div className="bk-ribbon">
                <div className="bk-group">
                    <div className="bk-group-body">
                        <div className="bk-big-btn">
                            <span className="bk-glyph bk-g-paste" />
                            <span>{S.PASTE}</span>
                        </div>
                        <div className="bk-small-col">
                            <span className="bk-small-btn">{S.CUT}</span>
                            <span className="bk-small-btn">{S.COPY}</span>
                            <span className="bk-small-btn">{S.FORMAT_PAINTER}</span>
                        </div>
                    </div>
                    <div className="bk-group-label">{S.GROUP_CLIPBOARD}</div>
                </div>

                <div className="bk-group">
                    <div className="bk-group-body bk-col">
                        <div className="bk-row">
                            <span className="bk-combo bk-font-name">{S.FONT_NAME}</span>
                            <span className="bk-combo bk-font-size">11</span>
                        </div>
                        <div className="bk-row">
                            <span className="bk-fmt bk-bold">B</span>
                            <span className="bk-fmt bk-italic">I</span>
                            <span className="bk-fmt bk-underline">U</span>
                            <span className="bk-fmt bk-strike">abc</span>
                            <span className="bk-fmt">
                                x<sub>2</sub>
                            </span>
                            <span className="bk-fmt">
                                x<sup>2</sup>
                            </span>
                            <span className="bk-fmt bk-highlight">A</span>
                            <span className="bk-fmt bk-fontcolor">A</span>
                        </div>
                    </div>
                    <div className="bk-group-label">{S.GROUP_FONT}</div>
                </div>

                <div className="bk-group">
                    <div className="bk-group-body bk-col">
                        <div className="bk-row">
                            <span className="bk-fmt bk-list-bullet" />
                            <span className="bk-fmt bk-list-number" />
                            <span className="bk-fmt bk-list-multi" />
                            <span className="bk-sep" />
                            <span className="bk-fmt bk-indent-less" />
                            <span className="bk-fmt bk-indent-more" />
                            <span className="bk-fmt bk-pilcrow" />
                        </div>
                        <div className="bk-row">
                            <span className="bk-fmt bk-align bk-align-left active" />
                            <span className="bk-fmt bk-align bk-align-center" />
                            <span className="bk-fmt bk-align bk-align-right" />
                            <span className="bk-fmt bk-align bk-align-justify" />
                            <span className="bk-sep" />
                            <span className="bk-fmt bk-linespacing" />
                            <span className="bk-fmt bk-shading" />
                        </div>
                    </div>
                    <div className="bk-group-label">{S.GROUP_PARAGRAPH}</div>
                </div>

                <div className="bk-group bk-group-styles">
                    <div className="bk-group-body">
                        {[S.STYLE_NORMAL, S.STYLE_NO_SPACING, S.STYLE_HEADING1, S.STYLE_HEADING2, S.STYLE_TITLE].map(
                            (name, index) => (
                                <div key={name} className={"bk-style" + (index === 0 ? " active" : "")}>
                                    <span className={"bk-style-preview bk-style-" + index}>AaBbCc</span>
                                    <span className="bk-style-name">{name}</span>
                                </div>
                            ),
                        )}
                    </div>
                    <div className="bk-group-label">{S.GROUP_STYLES}</div>
                </div>

                <div className="bk-group">
                    <div className="bk-group-body bk-col bk-editing">
                        <span className="bk-small-btn">{S.FIND}</span>
                        <span className="bk-small-btn">{S.REPLACE}</span>
                        <span className="bk-small-btn">{S.SELECT}</span>
                    </div>
                    <div className="bk-group-label">{S.GROUP_EDITING}</div>
                </div>
            </div>

            <div className="bk-canvas">
                {/* Word's Navigation pane, carrying the nearby-objects list.
                    The pane is a real Word feature that shows a flat, indented
                    list of short entries down the left side -- which is exactly
                    the shape of an object list, so it needs no disguising
                    beyond its own chrome. Attack targets are the "current"
                    entry (bold, marked), teammates are indented under them the
                    way sub-headings are. */}
                <div className="bk-navpane">
                    <div className="bk-nav-title">
                        {S.NAV_TITLE}
                        <span className="bk-nav-close" />
                    </div>
                    <div className="bk-nav-search">{S.NAV_SEARCH}</div>
                    <div className="bk-nav-tabs">
                        <span className="bk-nav-tab active">{S.NAV_TAB_HEADINGS}</span>
                        <span className="bk-nav-tab">{S.NAV_TAB_PAGES}</span>
                        <span className="bk-nav-tab">{S.NAV_TAB_RESULTS}</span>
                    </div>
                    <div className="bk-nav-list">
                        {navEntries.length === 0 ? (
                            <div className="bk-nav-empty">{S.NAV_EMPTY}</div>
                        ) : (
                            navEntries.map((entry) => (
                                <Fragment key={entry.num}>
                                <div
                                    className={
                                        "bk-nav-entry" +
                                        (entry.target ? " current" : "") +
                                        (entry.self ? " self" : "") +
                                        (entry.sub ? " sub" : "")
                                    }
                                >
                                    {entry.shortcut !== null && (
                                        <span className="bk-nav-num">{entry.shortcut}</span>
                                    )}
                                    <span className="bk-nav-entry-text">{entry.desc}</span>
                                    {entry.page !== null && (
                                        <span className="bk-nav-page">{entry.page}</span>
                                    )}
                                </div>
                                {entry.attackers.length > 0 && (
                                    <div className="bk-nav-entry sub bk-nav-attackers">
                                        <span className="bk-nav-entry-text">
                                            {S.NAV_ATTACKED_BY} {entry.attackers.join(", ")}
                                        </span>
                                    </div>
                                )}
                                </Fragment>
                            ))
                        )}
                    </div>
                </div>
                <div className="bk-canvas-main">
                    <div className="bk-scrollbar" />
                    {/* Word's ruler: grey margin zones at both ends, a ticked
                        white writable span between them, and the indent markers
                        (first-line wedge, hanging wedge + left-indent block,
                        right-indent wedge) sitting on the margin boundaries. */}
                    <div className="bk-ruler">
                        <span className="bk-ruler-margin" />
                        <span className="bk-ruler-track" />
                        <span className="bk-ruler-margin" />
                        <span className="bk-ruler-indent bk-indent-first" />
                        <span className="bk-ruler-indent bk-indent-hanging" />
                        <span className="bk-ruler-indent bk-indent-left" />
                        <span className="bk-ruler-indent bk-indent-right" />
                    </div>
                {/* The document body IS the game transcript, regrouped into
                    prose by documentLog.ts -- that is what makes the overlay
                    usable rather than just opaque: the game stays readable.
                    Before any output exists (not connected yet) it falls back
                    to a static report, so the page is never suspiciously blank. */}
                <div className="bk-page">
                    {/* The title block is a fixed part of the sheet, not part of
                        the scrolling text: the transcript scrolls in its own
                        region BELOW it. Sticky was tried and looked broken --
                        lines slid visibly under the heading. */}
                    <div className="bk-doc-titleblock">
                        <h1 className="bk-doc-h1">{S.DOC_TITLE}</h1>
                        <p className="bk-doc-sub">{S.DOC_SUBTITLE}</p>
                    </div>
                    {/* Text column on the left, figure column on the right.
                        The figure is deliberately OUTSIDE the scrolling body.
                        A float inside the flow gives real Word text-wrapping,
                        but the body pins itself to the newest line, so the map
                        scrolls off the page within seconds; making the float
                        sticky detaches it from its flow position and the text
                        then runs underneath it. A map that moves or vanishes is
                        worse than one without text under it, so it gets its own
                        column and stays put. */}
                    <div className="bk-doc-main">
                    <div className="bk-doc-body" ref={pageRef}>
                    {/* The text flow is wrapped so the composer below keeps a
                        STABLE position among its siblings. Without this, the
                        first output line switches this slot from the fallback
                        fragment to an array, React rebuilds the following
                        children, and the composer -- an uncontrolled input --
                        is remounted, silently discarding whatever was typed or
                        recalled into it. */}
                    <div className="bk-doc-flow">
                    {blocks.length === 0 ? (
                        <>
                            <h2 className="bk-doc-h2">{S.DOC_H1}</h2>
                            <p className="bk-doc-para">{S.DOC_P1}</p>
                            <p className="bk-doc-para">{S.DOC_P2}</p>
                            <h2 className="bk-doc-h2">{S.DOC_H2}</h2>
                            <p className="bk-doc-para">{S.DOC_P3}</p>
                            <p className="bk-doc-para">{S.DOC_P4}</p>
                        </>
                    ) : (
                        blocks.map((block, index) => {
                            if (block.kind === "heading") {
                                return (
                                    <h2 key={index} className="bk-doc-h2">
                                        {block.text}
                                    </h2>
                                );
                            }
                            if (block.kind === "blank") {
                                return <p key={index} className="bk-doc-blank" />;
                            }
                            return (
                                <p key={index} className="bk-doc-line">
                                    {block.text}
                                </p>
                            );
                        })
                    )}
                    </div>
                    {/* The line you are "writing": a real borderless input that
                        inherits the document's type, so the caret and the text
                        you type are indistinguishable from the body copy. Enter
                        sends it to the game, and the echo comes back as the next
                        paragraph. */}
                    <p className="bk-compose-line">
                        <input
                            ref={composerRef}
                            className="bk-composer"
                            type={passwordMode ? "password" : "text"}
                            autoComplete="off"
                            spellCheck={false}
                            // Marks this as a command line for the shared keybind
                            // guard (`shouldIgnoreGlobalKeybind`), so binds keep
                            // firing while it has focus -- without it the guard
                            // sees an ordinary text field and stands them down.
                            data-command-input=""
                            onKeyDown={(event) => {
                                const commandLine = getActiveCommandLine();
                                const input = event.currentTarget;
                                if (!commandLine) return;
                                if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    commandLine.submit(input.value);
                                    // Always clear, whatever `clearInputOnSend`
                                    // says: the command is not echoed into the
                                    // document, so leaving the sent text on the
                                    // line would read as an unfinished sentence
                                    // nobody typed.
                                    input.value = "";
                                } else if (event.key === "ArrowUp" && !event.ctrlKey) {
                                    event.preventDefault();
                                    input.value = commandLine.historyMove(input.value, "up");
                                } else if (event.key === "ArrowDown" && !event.ctrlKey) {
                                    event.preventDefault();
                                    input.value = commandLine.historyMove(input.value, "down");
                                } else if (event.key === "Tab") {
                                    event.preventDefault();
                                    input.value = commandLine.tabComplete(input.value, !event.shiftKey);
                                }
                            }}
                        />
                    </p>
                    </div>
                    {/* Both figures share one column, stacked: map above,
                        chart below. */}
                    <aside className="bk-figures">
                    <figure className="bk-figure">
                        <div className="bk-figure-frame" ref={mapFigureRef} />
                        <figcaption className="bk-figure-caption">{S.FIGURE_CAPTION}</figcaption>
                    </figure>
                    {/* Second figure: the vitals as a column chart. A bar
                        chart is the most document-native widget there is, and
                        it carries every vital at once -- the status bar only
                        has room for two. Series are labelled with the stock
                        UI's terse codes so the axis reads as column headings
                        rather than as a character sheet (see VITAL_BARS). */}
                    {chartBars.length > 0 && (
                        <figure className="bk-figure bk-chart-figure">
                            <div className="bk-chart">
                                <div className="bk-chart-plot">
                                    {chartBars.map((bar) => (
                                        <div key={bar.key} className="bk-chart-col">
                                            <span
                                                className="bk-chart-bar"
                                                style={{ height: `${Math.round(bar.ratio * 100)}%` }}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="bk-chart-axis">
                                    {chartBars.map((bar) => (
                                        <span key={bar.key} className="bk-chart-label">
                                            {bar.label}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <figcaption className="bk-figure-caption">{S.CHART_CAPTION}</figcaption>
                        </figure>
                    )}
                    </aside>
                    </div>
                    </div>
                </div>
            </div>

            <div className="bk-statusbar">
                <span className="bk-status-item bk-status-page">{statusPage}</span>
                <span className="bk-status-item">{S.STATUS_WORDS}</span>
                <span className="bk-status-item">{S.STATUS_LANGUAGE}</span>
                <span className="bk-status-item bk-status-a11y">{S.STATUS_ACCESSIBILITY}</span>
                <span className="bk-status-spacer" />
                <span className="bk-status-views">
                    <span className="bk-view active" />
                    <span className="bk-view" />
                    <span className="bk-view" />
                </span>
                <span className="bk-zoom">
                    <span className="bk-zoom-step">-</span>
                    <span className="bk-zoom-track">
                        <span className="bk-zoom-knob" style={{ left: `${knob * 100}%` }} />
                    </span>
                    <span className="bk-zoom-step">+</span>
                </span>
                <span className="bk-status-item bk-zoom-value">{zoom}%</span>
            </div>
        </div>,
        document.body,
    );
}
