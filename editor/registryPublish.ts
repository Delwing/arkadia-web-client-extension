import { getEditorPlugin, storeEditorPlugin } from '@client/utils/pluginEditorStorage.ts'
import {
  HANDOFF_PACKAGE,
  HANDOFF_PUBLISHED,
  HANDOFF_READY,
  REGISTRY_URL,
  handoffMetadata,
  handoffUrl,
  readRegistryMessage,
  type HandoffPackageMessage,
} from '@shared/marketplace/registryHandoff.ts'
import { buildPluginArchive } from './pluginManagement'
import type { StatusType } from './types'

/** Give up listening long after any realistic publish has finished. */
const HANDOFF_TIMEOUT_MS = 15 * 60 * 1000
const POPUP_POLL_MS = 1000

/**
 * Publish the current plugin to the registry.
 *
 * The editor deliberately holds no account: it opens the registry, hands over
 * the same ZIP that "Download" produces, and the registry does the signing in,
 * the metadata form and the publishing. All we keep is the slug it reports
 * back, so the next release is recognised as an update rather than a new
 * plugin.
 */
export async function publishToRegistry(
  pluginId: string,
  updateStatus: (message: string, type: StatusType) => void
): Promise<void> {
  const plugin = await getEditorPlugin(pluginId)
  if (!plugin) {
    updateStatus('Plugin not found', 'error')
    return
  }

  updateStatus('Przygotowywanie pakietu...', 'normal')

  let archive: ArrayBuffer
  try {
    archive = await (await buildPluginArchive(plugin)).arrayBuffer()
  } catch (error) {
    updateStatus('Nie udalo sie spakowac pluginu: ' + (error as Error).message, 'error')
    return
  }

  // Must be opened straight from the click that triggered this, or the browser
  // treats it as an unsolicited popup and blocks it.
  const popup = window.open(handoffUrl(), 'arkadia-registry-publish', 'width=760,height=940')
  if (!popup) {
    updateStatus(
      'Przegladarka zablokowala okno publikacji. Zezwol na wyskakujace okna i sprobuj ponownie.',
      'error'
    )
    return
  }

  updateStatus('Otwarto katalog - dokoncz publikacje w nowym oknie.', 'normal')

  let done = false
  const cleanup = () => {
    if (done) return
    done = true
    window.removeEventListener('message', onMessage)
    clearInterval(closedPoll)
    clearTimeout(timeout)
  }

  const onMessage = (event: MessageEvent) => {
    const message = readRegistryMessage(event, REGISTRY_URL)
    if (!message) return

    if (message.type === HANDOFF_READY) {
      const meta = handoffMetadata(plugin)
      const payload: HandoffPackageMessage = {
        type: HANDOFF_PACKAGE,
        ...meta,
        zip: archive,
      }
      // Not transferred: the editor keeps its copy in case of a retry.
      popup.postMessage(payload, REGISTRY_URL)
      return
    }

    if (message.type === HANDOFF_PUBLISHED) {
      cleanup()
      void rememberSlug(pluginId, message.slug)
      updateStatus(`Opublikowano ${message.slug} w wersji ${message.version}`, 'success')
    }
  }

  window.addEventListener('message', onMessage)

  const closedPoll = setInterval(() => {
    if (popup.closed) cleanup()
  }, POPUP_POLL_MS)

  const timeout = setTimeout(cleanup, HANDOFF_TIMEOUT_MS)
}

/**
 * Remember which catalogue entry this plugin belongs to. Re-read first: the
 * user may have kept editing while the registry window was open.
 */
async function rememberSlug(pluginId: string, slug: string): Promise<void> {
  try {
    const current = await getEditorPlugin(pluginId)
    if (!current || current.registrySlug === slug) return
    await storeEditorPlugin({ ...current, registrySlug: slug, updatedAt: Date.now() })
  } catch (error) {
    // Losing the slug only means the next publish asks for it again.
    console.error('[registry] failed to store slug', error)
  }
}
