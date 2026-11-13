// The Picture-in-Picture window's contents: a status header (location, cover
// timer), the list itself (always the list view) and a footer with the game's
// last output lines.

import type { RenderContext } from "@web/objectList/context.ts";
import { EmptyList, ListView } from "@web/objectList/views/index.tsx";

export interface PipViewProps {
    locationText: string;
    coverTimerText: string;
    /** The list to show; null while the client has no objects yet. */
    ctx: RenderContext | null;
    /** The last output lines, as the game output's HTML. */
    lastOutputHtml: string;
}

export function PipView({ locationText, coverTimerText, ctx, lastOutputHtml }: PipViewProps) {
    const status = [locationText, coverTimerText].filter(Boolean).join(' • ');
    return (
        <>
            {status && <div className="objects-list-pip-header">{status}</div>}
            <div className="objects-list-pip-body">
                {ctx && ctx.objects.length > 0 ? <ListView ctx={ctx} /> : <EmptyList />}
            </div>
            {lastOutputHtml && (
                <div className="objects-list-pip-footer">
                    <div className="objects-list-pip-footer-content" dangerouslySetInnerHTML={{ __html: lastOutputHtml }} />
                </div>
            )}
        </>
    );
}
