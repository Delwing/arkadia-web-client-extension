import Client from "./Client";

export type ClickCallback =
    | (() => void)
    | {
        left?: (ev: MouseEvent) => void;
        right?: (ev: MouseEvent) => void;
    };

export type ClickCallbackMap = Record<number, ClickCallback>;

export default class OutputHandler {

    client: Client
    output = document.getElementById("main_text_output_msg_wrapper")
    clickerCallbacks: any[] = [];
    private activeClickCallbacks = new Map<number, any>();
    private contextMenu = document.getElementById('context-menu') as HTMLElement | null;

    constructor(clientExtension: Client) {
        this.client = clientExtension
        document.addEventListener('click', this.hideContextMenu)
    }

    processOutput = (event: CustomEvent<number | null | void>) => {
        const wrapper = this.output
        if (!wrapper) {
            return
        }
        const count = typeof event.detail === 'number' && event.detail > 0 ? event.detail : 1
        const messages = Array.from(wrapper.querySelectorAll<HTMLElement>('.output_msg_text'))
        const toProcess = count >= messages.length ? messages : messages.slice(-count)
        toProcess.forEach(msg => this.applyClickListeners(msg))
    }

    private hideContextMenu = () => {
        if (this.contextMenu) {
            this.contextMenu.classList.remove('show')
            this.contextMenu.innerHTML = ''
            this.contextMenu.style.visibility = ''
        }
    }

    showContextMenu(
        items: { label: string; action: () => void }[],
        x: number,
        y: number,
        options?: { header?: string; smallHeader?: boolean }
    ) {
        if (!this.contextMenu) return
        this.hideContextMenu()
        const header = options?.header
        if (header) {
            const headerEl = document.createElement('div')
            headerEl.className = 'context-menu-header'
            if (options?.smallHeader) {
                headerEl.classList.add('context-menu-header-small')
            }
            headerEl.textContent = header
            this.contextMenu!.appendChild(headerEl)
        }
        items.forEach(item => {
            const btn = document.createElement('button')
            btn.textContent = item.label
            btn.onclick = () => {
                this.hideContextMenu()
                item.action()
            }
            this.contextMenu!.appendChild(btn)
        })
        const menu = this.contextMenu
        menu.style.left = `0px`
        menu.style.top = `0px`
        menu.style.visibility = 'hidden'
        menu.classList.add('show')

        const rect = menu.getBoundingClientRect()
        const viewportWidth = document.documentElement?.clientWidth ?? window.innerWidth ?? 0
        const viewportHeight = document.documentElement?.clientHeight ?? window.innerHeight ?? 0

        let left = x
        let top = y

        if (left + rect.width > viewportWidth) {
            left = Math.max(0, viewportWidth - rect.width)
        }

        if (top + rect.height > viewportHeight) {
            top = Math.max(0, viewportHeight - rect.height)
        }

        menu.style.left = `${left}px`
        menu.style.top = `${top}px`
        menu.style.visibility = ''
    }

    processOutput = (event: CustomEvent<number | undefined>) => {
        const count = typeof event.detail === 'number' ? event.detail : 0

        const applyToContainer = (container: HTMLElement | null) => {
            if (!container) {
                return
            }

            const messages = Array.from(container.querySelectorAll<HTMLElement>('.output_msg'))
            const startIndex = count > 0 ? Math.max(0, messages.length - count) : 0
            for (const message of messages.slice(startIndex)) {
                const text = message.querySelector<HTMLElement>('.output_msg_text')
                this.applyClickListeners(text)
            }
        }

        applyToContainer(this.output as HTMLElement | null)

        const stickyArea = document.getElementById('sticky-area') as HTMLElement | null
        if (stickyArea && stickyArea !== this.output) {
            applyToContainer(stickyArea)
        }
    }

    applyClickListeners(element: HTMLElement | null) {
        if (!element) {
            return
        }

        if (element.innerHTML.includes('{clickOpen:')) {
            this.parseClickTags(element)
            return
        }

        const spans = element.querySelectorAll<HTMLElement>('[data-click-index]')
        spans.forEach(span => {
            const indexAttr = span.getAttribute('data-click-index')
            if (!indexAttr) {
                return
            }
            const index = parseInt(indexAttr, 10)
            if (Number.isNaN(index)) {
                return
            }
            const titleAttr = span.getAttribute('data-click-title') || undefined
            this.decorateClickable(span, index, titleAttr ?? undefined)
        })
    }

    private getClickCallback(cbIndex: number): ClickCallback | undefined {
        let cb = this.clickerCallbacks[cbIndex]
        if (cb !== undefined) {
            this.clickerCallbacks[cbIndex] = undefined as any
            this.activeClickCallbacks.set(cbIndex, cb)
        } else {
            cb = this.activeClickCallbacks.get(cbIndex)
        }
        return cb
    }

    getCallbacksForIndices(indices: Iterable<number>): ClickCallbackMap {
        const mapping: ClickCallbackMap = {}
        for (const index of indices) {
            const cb = this.getClickCallback(index)
            if (cb) {
                mapping[index] = cb
            }
        }
        return mapping
    }

    private decorateClickable(span: HTMLElement, cbIndex: number, title?: string) {
        span.style.cursor = "pointer"
        span.style.textDecoration = " underline"
        span.style.textDecorationStyle = "dotted"
        span.style.textDecorationSkipInk = "auto"
        span.dataset.clickIndex = cbIndex.toString()
        if (title) {
            span.title = title
            span.dataset.clickTitle = title
        } else {
            span.removeAttribute('data-click-title')
        }
        const cb = this.getClickCallback(cbIndex)
        if (cb) {
            if (typeof cb === 'function') {
                span.onclick = () => {
                    cb?.apply(null)
                }
            } else {
                if (cb.left) {
                    span.onclick = (ev) => {
                        cb.left?.call(null, ev)
                    }
                }
                if (cb.right) {
                    span.oncontextmenu = (ev) => {
                        ev.preventDefault()
                        cb.right?.call(null, ev)
                    }
                    let timer: number | undefined
                    const clear = () => {
                        if (timer !== undefined) {
                            clearTimeout(timer)
                            timer = undefined
                        }
                    }
                    span.addEventListener('touchstart', (ev: any) => {
                        clear()
                        timer = window.setTimeout(() => {
                            const t = ev.touches && ev.touches[0]
                            if (t) {
                                const me = new MouseEvent('contextmenu', {
                                    bubbles: true,
                                    cancelable: true,
                                    clientX: t.clientX,
                                    clientY: t.clientY,
                                })
                                cb.right?.call(null, me)
                            }
                        }, 500)
                    })
                    span.addEventListener('touchend', clear)
                    span.addEventListener('touchcancel', clear)
                    span.addEventListener('touchmove', clear)
                }
            }
        }
    }

    private parseClickTags(msg: HTMLElement) {
        const openReg = /\{clickOpen:(\d+)(?::([^}]+))?}/
        const closeReg = /\{clickClose}/
        let currentIndex: number | null = null
        let currentTitle: string | undefined

        const processNode = (node: Node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                let text = node.textContent || ""
                const frag = document.createDocumentFragment()
                while (true) {
                    const openMatch = openReg.exec(text)
                    const closeMatch = closeReg.exec(text)
                    let match: RegExpExecArray | null = null
                    let isOpen = false
                    if (openMatch && (!closeMatch || openMatch.index <= closeMatch.index)) {
                        match = openMatch
                        isOpen = true
                    } else if (closeMatch) {
                        match = closeMatch
                    }
                    if (!match) {
                        const content = text
                        if (content) {
                            if (currentIndex !== null) {
                                const span = document.createElement("span")
                                span.textContent = content
                                this.decorateClickable(span, currentIndex, currentTitle)
                                frag.appendChild(span)
                            } else {
                                frag.appendChild(document.createTextNode(content))
                            }
                        }
                        break
                    }
                    const before = text.substring(0, match.index)
                    if (before) {
                        if (currentIndex !== null) {
                            const span = document.createElement("span")
                            span.textContent = before
                            this.decorateClickable(span, currentIndex, currentTitle)
                            frag.appendChild(span)
                        } else {
                            frag.appendChild(document.createTextNode(before))
                        }
                    }
                    if (isOpen) {
                        currentIndex = parseInt(match[1])
                        currentTitle = match[2]
                    } else {
                        currentIndex = null
                        currentTitle = undefined
                    }
                    text = text.substring(match.index + match[0].length)
                }
                (node as ChildNode).replaceWith(frag)
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                Array.from(node.childNodes).forEach(processNode)
                if (currentIndex !== null) {
                    this.decorateClickable(node as HTMLElement, currentIndex, currentTitle)
                }
            }
        }

        Array.from(msg.childNodes).forEach(processNode)
    }

    makeStringClickable(string: string, callback: Function, title?: string) {
        this.clickerCallbacks.push(callback)
        const index = this.clickerCallbacks.length - 1
        return `{clickOpen:${index}${title ? ":" + title : ""}}${string}{clickClose}`
    }

    makeStringRightClickable(string: string, callback: (ev: MouseEvent) => void, title?: string) {
        this.clickerCallbacks.push({ right: callback })
        const index = this.clickerCallbacks.length - 1
        return `{clickOpen:${index}${title ? ":" + title : ""}}${string}{clickClose}`
    }

    makeClickable(rawLine: string, string: string, callback: Function, title?: string) {
        const matchIndex = rawLine.indexOf(string)
        this.clickerCallbacks.push(callback)
        const index = this.clickerCallbacks.length - 1
        return rawLine.substring(0, matchIndex) + `{clickOpen:${index}${title ? ":" + title : ""}}${string}{clickClose}` + rawLine.substring(matchIndex + string.length)
    }
}
