export interface BuiltinPluginDefinition {
  /** Unique identifier used to reference the builtin plugin */
  id: string
  /** Display name shown in UI before plugin is loaded */
  name: string
  /** Short description of the builtin plugin */
  description?: string
}

export const BUILTIN_PLUGIN_DEFINITIONS: BuiltinPluginDefinition[] = [
  {
    id: 'builtin:debugging',
    name: 'Debugging plugin',
    description: 'Wyświetla surowe zdarzenia GMCP w wyskakującym oknie.',
  },
]

export const BUILTIN_PLUGIN_ID_SET = new Set(
  BUILTIN_PLUGIN_DEFINITIONS.map(definition => definition.id),
)
