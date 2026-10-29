import { useLayoutEffect, useRef } from "react";
import { globalStorage } from "@modules/core/storage.ts";
import { getDeviceViewSettings } from "@modules/core/settings";
import { setupOutputMessageHandler } from "@shared/dom/outputMessageHandler.ts";
import mudClient from "@web/MudClient.ts";
import { setupOutputContextMenu } from "@web/outputContextMenu.tsx";
import { installOutputSearch } from "@web/outputSearch/installOutputSearch.ts";
import { ToastStack, type ToastStackProps } from "@web/notifications/ToastStack.tsx";
import { installContentWidthMeasurer } from "@web/contentWidthMeasurer.ts";
import { useAppServices } from "../appServices";
import { attachOutputHandler } from "./outputHandle";

const STICKY_LINES = 50;
const DOUBLE_CLICK_TIMEOUT_MS = 300;

/**
 * The game output (#main_text_output_msg_wrapper): the toasts' strip at its top,
 * the scrollback pane (split view) at its bottom, and between them the lines,
 * which belong to the output engine (setupOutputMessageHandler), not to React.
 * The engine only ever inserts lines before the pane and trims lines, never the
 * strip or the pane, so React keeps owning those two.
 */
export function GameOutput({ toasts }: { toasts: ToastStackProps | null }) {
    const { client } = useAppServices();
    const wrapperRef = useRef<HTMLDivElement>(null);
    const noticesRef = useRef<HTMLDivElement>(null);
    const splitBottomRef = useRef<HTMLDivElement>(null);
    const splitHandleRef = useRef<HTMLDivElement>(null);
    const stickyRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);

    useLayoutEffect(() => {
        const outputWrapper = wrapperRef.current!;
        const splitBottom = splitBottomRef.current!;
        const notices = noticesRef.current!;
        const ac = new AbortController();
        const o = { signal: ac.signal };

        // Scroll/wheel/resize/drag split-view detection, trimming, and sticky-mirror
        // live in the shared engine (also used by forge-ui).
        const handler = setupOutputMessageHandler(mudClient, {
            outputWrapper,
            splitBottom,
            splitHandle: splitHandleRef.current!,
            stickyArea: stickyRef.current!,
            stickyLines: STICKY_LINES,
            maxElements: () => getDeviceViewSettings().outputMaxElements,
            onSplitViewResize: (heightPx) => {
                if (heightPx < 60) return;
                const settings = globalStorage.get("uiSettings");
                if (settings) {
                    settings.splitViewHeight = heightPx;
                    globalStorage.set("uiSettings", settings);
                }
            },
        });
        const detachHandle = attachOutputHandler(handler);

        const closeHistoryScrollback = () => handler.closeSplitView();

        closeRef.current!.addEventListener("click", () => {
            closeHistoryScrollback();
            (document.getElementById("message-input") as HTMLElement | null)?.focus();
        }, o);

        // Double tap or double click on the same spot closes the scrollback.
        let lastTap = 0;
        outputWrapper.addEventListener("touchend", (e) => {
            const now = Date.now();
            if (now - lastTap < DOUBLE_CLICK_TIMEOUT_MS) {
                e.preventDefault();
                closeHistoryScrollback();
            }
            lastTap = now;
        }, o);
        let lastClick = 0;
        let lastClickTarget: EventTarget | null = null;
        outputWrapper.addEventListener("click", (event) => {
            if (event.button !== 0) {
                return;
            }
            const now = Date.now();
            if (lastClickTarget === event.target && now - lastClick < DOUBLE_CLICK_TIMEOUT_MS) {
                closeHistoryScrollback();
                lastClick = 0;
                lastClickTarget = null;
                return;
            }
            lastClick = now;
            lastClickTarget = event.target;
        }, o);

        // Returning to the tab reflows the output; the split view must not take that for a scroll.
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) handler.suppressSplitView(500);
        }, o);

        // Multibinds appearing or disappearing is stock-only layout churn, so its
        // extra suppression + forced rescroll stays here, layered on top of the
        // shared engine via the returned handle.
        const footerLayoutElement = document.getElementById("footer-layout");
        const mutationObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === "attributes" && (mutation.target as Element).id === "multi-binds") {
                    handler.suppressSplitView(500);

                    // Force scroll to bottom after layout settles
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            // The split pane lies over the text, so only the real bottom counts
                            const isAtBottom = outputWrapper.scrollTop + outputWrapper.clientHeight >= outputWrapper.scrollHeight - 1;
                            if (isAtBottom) {
                                outputWrapper.scrollTop = outputWrapper.scrollHeight;
                            }
                        });
                    });
                }
            }
        });
        if (footerLayoutElement) {
            mutationObserver.observe(footerLayoutElement, {
                attributes: true,
                attributeFilter: ["class"],
                subtree: true,
            });
        }

        // The toasts are placed against the visible output, so the strip learns
        // the scrollport's height to reach the bottom corners.
        const measure = () => notices.style.setProperty("--toast-viewport-h", `${outputWrapper.clientHeight}px`);
        measure();
        const resizeObserver = new ResizeObserver(measure);
        resizeObserver.observe(outputWrapper);

        // The client core is DOM-free; the column width it wraps text to is
        // measured from the output and pushed in.
        installContentWidthMeasurer(client);

        setupOutputContextMenu(outputWrapper);
        installOutputSearch({
            outputWrapper,
            splitBottom,
            skip: [notices],
            commandInput: () => document.getElementById("message-input"),
        });

        return () => {
            ac.abort();
            mutationObserver.disconnect();
            resizeObserver.disconnect();
            detachHandle();
            handler.destroy();
        };
    }, [client]);

    return (
        <div id="main_text_output_msg_wrapper" ref={wrapperRef}>
            <div id="notification-center" data-output-keep="" ref={noticesRef}>
                {toasts && <ToastStack {...toasts} />}
            </div>
            <div id="split-bottom" className="split-hidden" ref={splitBottomRef}>
                <div id="split-handle" ref={splitHandleRef}></div>
                <div id="sticky-area" ref={stickyRef}></div>
                <button id="split-close" type="button" title="Dwuklik w okno też zamyka" ref={closeRef}>Zamknij</button>
            </div>
        </div>
    );
}
