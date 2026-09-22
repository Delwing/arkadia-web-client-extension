import {
    Backpack,
    CloudUpload,
    HardDriveDownload,
    MonitorSmartphone,
    FileInput,
    ChartPie,
    Ellipsis,
    Map as MapIcon,
    MousePointerClick,
    Palette,
    PanelBottom,
    PanelsTopLeft,
    Shield,
    SlidersHorizontal,
    Smartphone,
    SquareTerminal,
    Swords,
    Volume2,
    WandSparkles,
    type LucideIcon,
} from "lucide-react";
import type { SettingsCategoryKey } from "./categories";

// Kept here rather than in categories.ts, which the assistant-KB build reads in Node.
const CATEGORY_ICONS: Record<SettingsCategoryKey, LucideIcon> = {
    "character-general": SlidersHorizontal,
    "character-items": Backpack,
    "character-combat": Swords,
    "character-guilds": Shield,
    "character-magics": WandSparkles,
    "ui-appearance": Palette,
    "ui-windows": PanelsTopLeft,
    "ui-commands": SquareTerminal,
    "ui-buttons": MousePointerClick,
    "ui-mobile-buttons": Smartphone,
    "ui-radial": ChartPie,
    "ui-footer": PanelBottom,
    "ui-map": MapIcon,
    "ui-sound": Volume2,
    "ui-other": Ellipsis,
    "data-sync": CloudUpload,
    "data-backup": HardDriveDownload,
    "data-devices": MonitorSmartphone,
    "data-import": FileInput,
};

export function NavIcon({ category, size = 16, className = "settings-dialog__nav-icon" }: { category: SettingsCategoryKey; size?: number; className?: string }) {
    const Icon = CATEGORY_ICONS[category];
    return <Icon className={className} size={size} strokeWidth={1.75} />;
}
