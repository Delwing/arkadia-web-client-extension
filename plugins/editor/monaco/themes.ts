/**
 * Editor themes: the Shiki themes on offer, the saved choice and editor
 * preferences, and the page chrome recoloured to match the editor's theme.
 */
import * as monaco from 'monaco-editor'

/**
 * The themes the editor offers, imported one by one. The full `shiki` bundle
 * would also work, but it makes the build emit every grammar and theme Shiki
 * has (~300 chunks, ~9 MB) for the 3 languages the editor loads; plain text
 * needs no grammar.
 */
export const editorThemes = () => [
  import('shiki/themes/andromeeda.mjs'),
  import('shiki/themes/aurora-x.mjs'),
  import('shiki/themes/ayu-dark.mjs'),
  import('shiki/themes/catppuccin-frappe.mjs'),
  import('shiki/themes/catppuccin-latte.mjs'),
  import('shiki/themes/catppuccin-macchiato.mjs'),
  import('shiki/themes/catppuccin-mocha.mjs'),
  import('shiki/themes/dark-plus.mjs'),
  import('shiki/themes/dracula.mjs'),
  import('shiki/themes/dracula-soft.mjs'),
  import('shiki/themes/everforest-dark.mjs'),
  import('shiki/themes/everforest-light.mjs'),
  import('shiki/themes/github-dark.mjs'),
  import('shiki/themes/github-dark-default.mjs'),
  import('shiki/themes/github-dark-dimmed.mjs'),
  import('shiki/themes/github-dark-high-contrast.mjs'),
  import('shiki/themes/github-light.mjs'),
  import('shiki/themes/github-light-default.mjs'),
  import('shiki/themes/github-light-high-contrast.mjs'),
  import('shiki/themes/gruvbox-dark-hard.mjs'),
  import('shiki/themes/gruvbox-dark-medium.mjs'),
  import('shiki/themes/gruvbox-dark-soft.mjs'),
  import('shiki/themes/gruvbox-light-hard.mjs'),
  import('shiki/themes/gruvbox-light-medium.mjs'),
  import('shiki/themes/gruvbox-light-soft.mjs'),
  import('shiki/themes/houston.mjs'),
  import('shiki/themes/kanagawa-dragon.mjs'),
  import('shiki/themes/kanagawa-lotus.mjs'),
  import('shiki/themes/kanagawa-wave.mjs'),
  import('shiki/themes/laserwave.mjs'),
  import('shiki/themes/light-plus.mjs'),
  import('shiki/themes/material-theme.mjs'),
  import('shiki/themes/material-theme-darker.mjs'),
  import('shiki/themes/material-theme-lighter.mjs'),
  import('shiki/themes/material-theme-ocean.mjs'),
  import('shiki/themes/material-theme-palenight.mjs'),
  import('shiki/themes/min-dark.mjs'),
  import('shiki/themes/min-light.mjs'),
  import('shiki/themes/monokai.mjs'),
  import('shiki/themes/night-owl.mjs'),
  import('shiki/themes/nord.mjs'),
  import('shiki/themes/one-dark-pro.mjs'),
  import('shiki/themes/one-light.mjs'),
  import('shiki/themes/plastic.mjs'),
  import('shiki/themes/poimandres.mjs'),
  import('shiki/themes/red.mjs'),
  import('shiki/themes/rose-pine.mjs'),
  import('shiki/themes/rose-pine-dawn.mjs'),
  import('shiki/themes/rose-pine-moon.mjs'),
  import('shiki/themes/slack-dark.mjs'),
  import('shiki/themes/slack-ochin.mjs'),
  import('shiki/themes/snazzy-light.mjs'),
  import('shiki/themes/solarized-dark.mjs'),
  import('shiki/themes/solarized-light.mjs'),
  import('shiki/themes/synthwave-84.mjs'),
  import('shiki/themes/tokyo-night.mjs'),
  import('shiki/themes/vesper.mjs'),
  import('shiki/themes/vitesse-black.mjs'),
  import('shiki/themes/vitesse-dark.mjs'),
  import('shiki/themes/vitesse-light.mjs'),
]


export function defineCustomTheme() {
  monaco.editor.defineTheme('plugin-theme', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#1E1E1E',
      'editor.foreground': '#D4D4D4',
      'editor.lineHighlightBackground': '#2A2A2A',
      'editorCursor.foreground': '#FFFFFF',
      'editor.selectionBackground': '#264F78',
    }
  })
}

/**
 * Get the saved theme preference or default
 */
export function getSavedTheme(): string {
  return localStorage.getItem('editor-theme') || 'dark-plus'
}

export interface EditorPrefs {
  fontSize: number
  minimap: boolean
  /** A single click opens a file in a preview tab that the next one replaces. */
  previewTabs: boolean
  /** Saved versions kept per file in the local history; 0 keeps none. */
  historyVersions: number
  /** Versions older than this many days are dropped from the local history. */
  historyDays: number
}

const PREFS_KEY = 'editor-prefs'
const DEFAULT_PREFS: EditorPrefs = { fontSize: 14, minimap: true, previewTabs: true, historyVersions: 50, historyDays: 30 }

/** The editor's settings from the settings popover, kept across sessions. */
export function getEditorPrefs(): EditorPrefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function saveEditorPrefs(patch: Partial<EditorPrefs>) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...getEditorPrefs(), ...patch }))
  } catch {
    // Storage full or blocked: the change still applies for this session.
  }
}

/**
 * Apply cached theme colors immediately on page load (before Shiki initializes)
 * This prevents the flash of wrong colors when the page loads
 */
export function applyInitialThemeFromCache(): void {
  const savedTheme = getSavedTheme()
  const cachedColors = localStorage.getItem(`editor-theme-colors-${savedTheme}`)

  if (cachedColors) {
    try {
      const colors = JSON.parse(cachedColors)
      Object.entries(colors).forEach(([key, value]) => {
        document.documentElement.style.setProperty(key, value as string)
      })
      document.body.style.background = colors['--editor-bg'] || '#1E1E1E'
      document.body.style.color = colors['--editor-fg'] || '#D4D4D4'
    } catch {
      // Ignore parse errors, will use defaults
    }
  }
}

/**
 * Six-digit hex without '#': expands short hex (#fff, #fffa) and drops alpha
 */
function toHex6(hexColor: string): string {
  let hex = hexColor.replace('#', '')
  if (hex.length === 3 || hex.length === 4) hex = hex.slice(0, 3).split('').map(c => c + c).join('')
  return hex.slice(0, 6)
}

/**
 * Helper to determine if a color is light or dark
 */
function isLightColor(hexColor: string): boolean {
  const hex = toHex6(hexColor)
  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5
}

/**
 * Darken a color by a percentage
 */
function darkenColor(hexColor: string, percent: number): string {
  const hex = toHex6(hexColor)
  const r = Math.max(0, parseInt(hex.substr(0, 2), 16) * (1 - percent))
  const g = Math.max(0, parseInt(hex.substr(2, 2), 16) * (1 - percent))
  const b = Math.max(0, parseInt(hex.substr(4, 2), 16) * (1 - percent))
  return '#' + Math.round(r).toString(16).padStart(2, '0') +
               Math.round(g).toString(16).padStart(2, '0') +
               Math.round(b).toString(16).padStart(2, '0')
}

/**
 * Lighten a color by a percentage
 */
function lightenColor(hexColor: string, percent: number): string {
  const hex = toHex6(hexColor)
  const r = Math.min(255, parseInt(hex.substr(0, 2), 16) + (255 - parseInt(hex.substr(0, 2), 16)) * percent)
  const g = Math.min(255, parseInt(hex.substr(2, 2), 16) + (255 - parseInt(hex.substr(2, 2), 16)) * percent)
  const b = Math.min(255, parseInt(hex.substr(4, 2), 16) + (255 - parseInt(hex.substr(4, 2), 16)) * percent)
  return '#' + Math.round(r).toString(16).padStart(2, '0') +
               Math.round(g).toString(16).padStart(2, '0') +
               Math.round(b).toString(16).padStart(2, '0')
}

/**
 * Apply theme colors to the UI
 */
export function applyThemeToUI(themeName: string) {
  const highlighter = (window as any).__shikiHighlighter
  if (!highlighter) return

  try {
    const theme = highlighter.getTheme(themeName)
    const colors = theme.colors || {}

    // Get background and foreground colors
    const editorBg = colors['editor.background'] || '#1E1E1E'
    const editorFg = colors['editor.foreground'] || '#D4D4D4'
    const isLight = isLightColor(editorBg)

    // For light themes, we need to derive darker colors, for dark themes lighter colors
    const menuBg = colors['sideBar.background'] || colors['menu.background'] || colors['editor.background'] ||
                   (isLight ? lightenColor(editorBg, 0.05) : darkenColor(editorBg, 0.05))

    const inputBg = colors['input.background'] || colors['dropdown.background'] ||
                    (isLight ? darkenColor(editorBg, 0.05) : lightenColor(editorBg, 0.1))

    const borderColor = colors['widget.border'] || colors['panel.border'] || colors['sideBar.border'] ||
                        (isLight ? darkenColor(editorBg, 0.15) : lightenColor(editorBg, 0.15))

    const hoverBg = colors['list.hoverBackground'] ||
                    (isLight ? darkenColor(editorBg, 0.05) : lightenColor(editorBg, 0.05))

    const activeBg = colors['list.activeSelectionBackground'] ||
                     (isLight ? darkenColor(editorBg, 0.1) : lightenColor(editorBg, 0.1))

    const accentColor = colors['focusBorder'] || colors['activityBarBadge.background'] || '#007acc'

    // Additional colors for better theming
    const sidebarHeaderBg = colors['sideBarSectionHeader.background'] || menuBg
    const sidebarFg = colors['sideBar.foreground'] || editorFg
    const buttonBg = colors['button.background'] || accentColor
    const buttonFg = colors['button.foreground'] || (isLightColor(buttonBg) ? '#000000' : '#ffffff')
    const buttonHoverBg = colors['button.hoverBackground'] ||
                          (isLightColor(buttonBg) ? darkenColor(buttonBg, 0.1) : lightenColor(buttonBg, 0.1))

    const errorButtonBg = colors['statusBarItem.errorBackground'] || colors['errorForeground'] ||
                          (isLight ? '#c72e0f' : '#f48771')
    const errorButtonFg = isLightColor(errorButtonBg) ? '#000000' : '#ffffff'
    const inputFg = colors['input.foreground'] || editorFg
    // Recessed field ground for the chrome: darker than the editor on dark
    // themes, near-white on light ones.
    const inputGround = isLight ? lightenColor(editorBg, 0.7) : darkenColor(editorBg, 0.25)

    // Build the color map
    const colorMap: Record<string, string> = {
      '--editor-bg': editorBg,
      '--editor-fg': editorFg,
      '--menu-bg': menuBg,
      '--input-bg': inputBg,
      '--border-color': borderColor,
      '--hover-bg': hoverBg,
      '--active-bg': activeBg,
      '--accent-color': accentColor,
      '--sidebar-header-bg': sidebarHeaderBg,
      '--sidebar-fg': sidebarFg,
      '--button-bg': buttonBg,
      '--button-fg': buttonFg,
      '--button-hover-bg': buttonHoverBg,
      '--error-button-bg': errorButtonBg,
      '--error-button-fg': errorButtonFg,
      '--input-fg': inputFg,
      '--input-ground': inputGround,
    }

    // Apply CSS variables
    Object.entries(colorMap).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value)
    })

    // Apply to body background
    document.body.style.background = editorBg
    document.body.style.color = editorFg

    // Cache the colors for instant load next time
    try {
      localStorage.setItem(`editor-theme-colors-${themeName}`, JSON.stringify(colorMap))
    } catch {
      // Ignore storage errors
    }
  } catch (error) {
    console.error('Failed to apply theme to UI:', error)
  }
}

/**
 * Change the editor theme
 */
export function changeTheme(themeName: string) {
  monaco.editor.setTheme(themeName)

  // Store theme preference
  localStorage.setItem('editor-theme', themeName)

  // Apply theme colors to UI
  applyThemeToUI(themeName)
}
