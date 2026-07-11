import type { ReactNode } from 'react';

interface PanelProps {
    /** Header label — rendered in the forged Cinzel caps voice. */
    title: string;
    /** Extra class(es) for the outer frame, e.g. sizing overrides per panel. */
    className?: string;
    /** Optional right-aligned header slot (count, location label, ...). */
    meta?: ReactNode;
    /** Optional id for the meta span (kept for parity with legacy hooks). */
    metaId?: string;
    /** Optional id for the body container. */
    bodyId?: string;
    /** Extra class(es) for the body, e.g. layout tweaks per panel. */
    bodyClassName?: string;
    children: ReactNode;
}

/**
 * Shared "forged" frame shell for the alt-ui side panels. Owns the outer
 * `.forged.panel` chrome, the header row (ornament + title + optional meta) and
 * the scrollable body, so every panel gets the same bevel, divider and
 * cap-centered header. New frames should render through this rather than
 * re-declaring the markup.
 */
export default function Panel({ title, className, meta, metaId, bodyId, bodyClassName, children }: PanelProps) {
    return (
        <div className={'forged panel' + (className ? ` ${className}` : '')}>
            <div className="panel__head">
                <span className="orn" />
                <span className="panel__title">{title}</span>
                {meta !== undefined && (
                    <span className="panel__meta" id={metaId}>{meta}</span>
                )}
            </div>
            <div className={'panel__body' + (bodyClassName ? ` ${bodyClassName}` : '')} id={bodyId}>
                {children}
            </div>
        </div>
    );
}
