import { useLayoutEffect, useRef } from "react";
import StockFooter from "@web-ui/footer/layout/StockFooter";
import { setupMobileFooter } from "@web/mobileFooter.ts";
import { ErrorBoundary } from "../ErrorBoundary";
import { getOutputHandler } from "./outputHandle";

/**
 * The footer (#footer-layout): the location binds (#multi-binds) and the status
 * line (#char-state), as the footer layout arranges them.
 */
export function Footer() {
    const ref = useRef<HTMLDivElement>(null);

    // Phone footer: the expander that unfolds its two scrolling rails. The rest
    // of that layout is CSS (footerMobile.css) plus CharState's compact meters.
    useLayoutEffect(() => setupMobileFooter(), []);

    // Multibinds appearing or disappearing is stock-only layout churn: the output
    // must not take the jump for a scroll, and stays pinned to the bottom.
    useLayoutEffect(() => {
        const mutationObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === "attributes" && (mutation.target as Element).id === "multi-binds") {
                    getOutputHandler()?.suppressSplitView(500);

                    // Force scroll to bottom after layout settles
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            const outputWrapper = document.getElementById("main_text_output_msg_wrapper");
                            if (!outputWrapper) return;
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
        mutationObserver.observe(ref.current!, {
            attributes: true,
            attributeFilter: ["class"],
            subtree: true,
        });
        return () => mutationObserver.disconnect();
    }, []);

    return (
        <div id="footer-layout" ref={ref}>
            <ErrorBoundary name="StockFooter"><StockFooter /></ErrorBoundary>
        </div>
    );
}
