import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Check,
    Copy,
    Download,
    FolderOpen,
    Search,
    SlidersHorizontal,
    Sparkles,
    SkipBack,
    SkipForward,
    TriangleAlert,
    X,
} from "lucide-react";
import type { ComponentType } from "react";

/**
 * The client's icon vocabulary.
 *
 * Icons come from lucide-react, already a dependency here: 1.5–2px stroke line
 * icons, no emoji, which is exactly the brief. The indirection through a name
 * map is the point — call sites ask for a *meaning* ("jump-start"), so swapping
 * the icon set, or one icon, is a change in this file rather than a sweep
 * across the UI.
 *
 * Add a name when a screen needs one. Do not import from lucide-react directly
 * in new design-system screens.
 */
const ICONS = {
    "chevron-down": ChevronDown,
    "chevron-left": ChevronLeft,
    "chevron-right": ChevronRight,
    "chevron-up": ChevronUp,
    check: Check,
    close: X,
    copy: Copy,
    export: Download,
    filters: SlidersHorizontal,
    folder: FolderOpen,
    "jump-start": SkipBack,
    "jump-end": SkipForward,
    search: Search,
    sparkle: Sparkles,
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
