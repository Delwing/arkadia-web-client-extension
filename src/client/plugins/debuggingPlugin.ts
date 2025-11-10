import type { PopupHandle, PopupMenuEntryHandle } from '@client/PluginApi'
import type { Plugin } from '@shared/types/Plugin'

interface GmcpEventPayload {
  path?: string
  value?: unknown
}

const MAX_ENTRIES = 200

function formatEntry({ path, value }: Required<Pick<GmcpEventPayload, 'path' | 'value'>>) {
  const timestamp = new Date().toLocaleTimeString()
  const json = (() => {
    try {
      return JSON.stringify(value, null, 2)
    } catch (error) {
      return `Nie udało się sformatować danych: ${String(error)}`
    }
  })()

  return `[#${timestamp}] ${path}\n${json}`
}

let teardown: (() => void) | null = null

export const debuggingPlugin: Plugin = {
  async init(api) {
    const entries: Required<Pick<GmcpEventPayload, 'path' | 'value'>>[] = []
    let popupHandle: PopupHandle | null = null
    let menuEntry: PopupMenuEntryHandle | null = null

    const scrollContainer = document.createElement('div')
    scrollContainer.style.height = '20rem'
    scrollContainer.style.overflowY = 'auto'
    scrollContainer.style.background = 'var(--bs-body-bg, #111)'
    scrollContainer.style.border = '1px solid rgba(255, 255, 255, 0.1)'
    scrollContainer.style.padding = '0.5rem'
    scrollContainer.style.borderRadius = '0.25rem'

    const logElement = document.createElement('pre')
    logElement.className = 'debugging-plugin__log'
    logElement.style.margin = '0'
    logElement.style.whiteSpace = 'pre-wrap'
    logElement.style.wordBreak = 'break-word'

    scrollContainer.appendChild(logElement)

    const container = document.createElement('div')
    container.className = 'd-flex flex-column gap-2'

    const description = document.createElement('p')
    description.className = 'mb-0'
    description.textContent = 'Nasłuchiwanie wszystkich zdarzeń GMCP. Najnowsze wpisy pojawiają się na końcu.'

    const controls = document.createElement('div')
    controls.className = 'd-flex gap-2 align-items-center'

    const clearButton = document.createElement('button')
    clearButton.type = 'button'
    clearButton.className = 'btn btn-sm btn-secondary'
    clearButton.textContent = 'Wyczyść'
    clearButton.addEventListener('click', () => {
      entries.length = 0
      render()
    })

    controls.appendChild(clearButton)

    container.appendChild(description)
    container.appendChild(controls)
    container.appendChild(scrollContainer)

    const render = () => {
      const shouldStickToBottom = Math.abs(scrollContainer.scrollTop - (scrollContainer.scrollHeight - scrollContainer.clientHeight)) < 4
      logElement.textContent = entries.map(formatEntry).join('\n\n')
      if (shouldStickToBottom) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }

    const openPopup = () => {
      if (popupHandle && popupHandle.element.isConnected) {
        popupHandle.element.focus()
        return
      }

      popupHandle = api.ui.createPopup('Debugging plugin', container)
      render()
    }

    const gmcpListener = ({ path, value }: GmcpEventPayload = {}) => {
      if (!path) {
        return
      }

      entries.push({ path, value })
      if (entries.length > MAX_ENTRIES) {
        entries.splice(0, entries.length - MAX_ENTRIES)
      }

      if (popupHandle && !popupHandle.element.isConnected) {
        popupHandle = null
      }

      if (popupHandle) {
        render()
      }
    }

    api.events.on('gmcp', gmcpListener)

    menuEntry = api.ui.addPopupMenuEntry('Debugging plugin', openPopup)

    teardown = () => {
      api.events.off('gmcp', gmcpListener)
      if (popupHandle) {
        if (popupHandle.element.isConnected) {
          popupHandle.close()
        }
        popupHandle = null
      }
      if (menuEntry) {
        menuEntry.remove()
        menuEntry = null
      }
    }

    return {
      name: 'Debugging plugin',
      version: '1.0.0',
      description: 'Wyświetla w czasie rzeczywistym surowe wiadomości GMCP.',
      author: 'Arkadia',
    }
  },

  async destroy() {
    if (teardown) {
      teardown()
      teardown = null
    }
  },
}

export default debuggingPlugin
