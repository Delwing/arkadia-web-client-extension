/**
 * Arkadia design system — public surface.
 *
 * Import components from here (`@design`), never from the individual files, so
 * primitives can be reorganised without touching screens.
 *
 * The stylesheet is NOT imported by this module: an entry point imports
 * `@design/css/index.css` once, at the top of its own entry file. Bundling the
 * CSS into the JS barrel would make every screen that touches one primitive
 * drag in the whole system.
 */

export { cx } from "./cx";
export type { ClassValue } from "./cx";

export { Badge } from "./primitives/Badge";
export type { BadgeProps, BadgeTone } from "./primitives/Badge";

export { Button, IconButton } from "./primitives/Button";
export type { ButtonProps, ButtonSize, ButtonVariant, IconButtonProps } from "./primitives/Button";

export { Callout, EmptyState } from "./primitives/Callout";
export type { CalloutTone } from "./primitives/Callout";

export { Checkbox } from "./primitives/Checkbox";
export type { CheckboxProps } from "./primitives/Checkbox";

export { Chip } from "./primitives/Chip";
export type { ChipProps } from "./primitives/Chip";

export {
    Dialog,
    DialogBody,
    DialogClose,
    DialogFooter,
    DialogHeader,
    DialogSubtitle,
    DialogTitle,
} from "./primitives/Dialog";
export type { DialogProps } from "./primitives/Dialog";

export { Field } from "./primitives/Field";
export type { FieldProps } from "./primitives/Field";

export { Icon } from "./primitives/Icon";
export type { IconName, IconProps } from "./primitives/Icon";

export { Input, InputShell } from "./primitives/Input";
export type { InputProps, InputShellProps } from "./primitives/Input";

export { Kbd } from "./primitives/Kbd";

export { Col, Divider, Row, Spacer } from "./primitives/Layout";

export { Menu, MenuItem, MenuLabel, MenuSeparator } from "./primitives/Menu";
export type { MenuProps } from "./primitives/Menu";

export { Segmented } from "./primitives/Segmented";
export type { SegmentedOption, SegmentedProps } from "./primitives/Segmented";

export { Select } from "./primitives/Select";
export type { SelectOption, SelectProps } from "./primitives/Select";

export { Spinner } from "./primitives/Spinner";

export { Switch } from "./primitives/Switch";
export type { SwitchProps } from "./primitives/Switch";

export { TabPanel, Tabs } from "./primitives/Tabs";
export type { TabItem, TabsProps } from "./primitives/Tabs";

export { Toggle } from "./primitives/Toggle";
export type { ToggleProps } from "./primitives/Toggle";

export { Tooltip, TooltipProvider } from "./primitives/Tooltip";
export type { TooltipProps } from "./primitives/Tooltip";

export {
    applyTheme,
    buildCustomThemeCss,
    BUILT_IN_THEMES,
    CUSTOM_THEME_ID,
    DEFAULT_THEME,
    hexToHsl,
    hexToRgba,
    isBuiltInTheme,
    luminance,
    randomThemeColor,
    removeCustomTheme,
    THEME_CATALOG,
} from "./themes/theme";
export type { BuiltInTheme, ThemeId, ThemeSelection } from "./themes/theme";
