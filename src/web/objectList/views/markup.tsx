// Small pieces every view uses: plugin-supplied HTML, the object's name text,
// the cover shield after a name, and the "no objects" placeholder.

import type { ReactNode } from "react";
import type { RenderContext } from "@web/objectList/context.ts";
import type { Entry } from "./entry.ts";
import { escapeHtml } from "./util.ts";

/**
 * HTML a plugin filter supplied (`content.numberLabel`, `content.hpBar`,
 * `content.description`, `style.prefix` / `style.suffix`). The plugin API has
 * always taken HTML there, so it is inserted as such; the game's own text never
 * goes through here.
 */
export function Rich({ html }: { html: string }) {
    return <span className="ol-rich" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** The shown description: the filter's replacement, or the object's own (as text). */
export function Description({ entry }: { entry: Entry }) {
    const html = entry.filter.content?.description;
    return html !== undefined ? <Rich html={html} /> : <>{entry.obj.desc || ""}</>;
}

/**
 * The name with the filters' prefix and suffix around it. With neither set the
 * object's description stays plain text.
 */
export function NameText({ entry }: { entry: Entry }) {
    const prefix = entry.filter.style?.prefix || "";
    const suffix = entry.filter.style?.suffix || "";
    if (!prefix && !suffix) return <Description entry={entry} />;
    const desc = entry.filter.content?.description ?? escapeHtml(entry.obj.desc || "");
    return <Rich html={`${prefix}${desc}${suffix}`} />;
}

const COVER_SHIELD_PATH = 'M12 2.5 4 5.5v6c0 5 3.4 8.8 8 10 4.6-1.2 8-5 8-10v-6z';

/**
 * The name content with the shield after it, for an enemy the cover tracker says
 * is shielded. The text gets its own span so card names keep their ellipsis on
 * the text and the shield never gets clipped.
 */
export function CoverMarked({ obj, ctx, children }: { obj: any; ctx: RenderContext; children: ReactNode }) {
    const mark = ctx.coverMarks.get(obj.num);
    if (!mark) return <>{children}</>;
    return (
        <>
            <span className="cover-name">{children}</span>
            <svg className={`cover-mark cover-mark--${mark.kind}`} viewBox="0 0 24 24">
                <title>{`Zasłonięty przed: ${mark.blocked.join(', ')}`}</title>
                <path d={COVER_SHIELD_PATH} />
            </svg>
        </>
    );
}

export function EmptyList() {
    return <span style={{ color: '#888', fontStyle: 'italic' }}>Brak obiektów</span>;
}
