// This module previously hosted the imperative "Ustawienia UI" modal wiring.
// The modal is now a React component (src/web/uiSettings/UiSettings.tsx) and the
// framework-agnostic data/apply logic lives in src/web/uiSettingsCore.ts.
// This file is kept as a backwards-compatible re-export surface (e.g. the
// `UiSettings` type imported via `@web/uiSettings` by the timer components).
export * from "./uiSettingsCore";
