/**
 * Types for `import { Button, … } from '@arkadia/ui'` in plugins built with
 * the `arkadiaHostUi()` esbuild plugin (see esbuild.cjs).
 *
 * Add to a plugin's tsconfig "types", or reference it:
 *   /// <reference types="@arkadia/plugin-types/ui" />
 *
 * @experimental The component set and props may change between client versions.
 */
declare module '@arkadia/ui' {
  import type { PluginUiComponents } from '@arkadia/plugin-types';

  export const Button: PluginUiComponents['Button'];
  export const Check: PluginUiComponents['Check'];
  export const Field: PluginUiComponents['Field'];
  export const HeaderButton: PluginUiComponents['HeaderButton'];
  export const Input: PluginUiComponents['Input'];
  export const MenuButton: PluginUiComponents['MenuButton'];
  export const Notice: PluginUiComponents['Notice'];
  export const Segmented: PluginUiComponents['Segmented'];
  export const Select: PluginUiComponents['Select'];
}
