import {
    Archive,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Copy,
    Download,
    ExternalLink,
    Search,
    SkipBack,
    SkipForward,
    Upload,
    Trash2,
    TriangleAlert,
    X,
} from "lucide-react";
import type { ComponentType } from "react";

/**
 * The viewer's icon vocabulary.
 *
 * `lucide-react` is already a client dependency, so the icons cost nothing new.
 * The indirection through a name map is the point: call sites ask for a
 * *meaning* ("jump-start"), so swapping the icon set is a change in this file
 * rather than a sweep across the components.
 */
const ICONS = {
    archive: Archive,
    "chevron-down": ChevronDown,
    "chevron-left": ChevronLeft,
    "chevron-right": ChevronRight,
    "chevron-up": ChevronUp,
    close: X,
    copy: Copy,
    export: Download,
    import: Upload,
    "jump-start": SkipBack,
    "jump-end": SkipForward,
    "open-external": ExternalLink,
    search: Search,
    trash: Trash2,
    warning: TriangleAlert,
} satisfies Record<string, ComponentType<{ size?: number; strokeWidth?: number; className?: string }>>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
    name: IconName;
    /** Matches the control it sits in: 14 inside text, 16 in icon buttons. */
    size?: number;
    className?: string;
}

export function Icon({ name, size = 16, className }: IconProps) {
    const Glyph = ICONS[name];
    return <Glyph size={size} strokeWidth={2} className={className} />;
}
