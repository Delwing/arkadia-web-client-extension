import Client from "./Client";

export default class OutputHandler {

    client: Client
    output = document.getElementById("main_text_output_msg_wrapper")
    clickerCallbacks: any[] = [];

    constructor(client: Client) {
        this.client = client
        this.client.on('output-sent', (count) => {
            this.processOutput(count);
        })
        this.client.on('buffer-sent', (count) => {
                this.processOutput(count);
            }
        )
    }

    private decorateClickable(span: HTMLElement, cbIndex: number, title?: string) {
        span.dataset.outputClickable = "true"
        span.style.cursor = "pointer"
        span.style.textDecoration = " underline"
        span.style.textDecorationStyle = "dotted"
        span.style.textDecorationSkipInk = "auto"
        if (title) {
            span.title = title
        }
        const cb = this.clickerCallbacks[cbIndex]
        this.clickerCallbacks[cbIndex] = undefined as any
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

    private processOutput(count: number) {
        if (!this.output.children) {
            return
        }
        const offset = this.output.querySelector('#split-bottom') ? 2 : 1
        for (let i = 0; i < count; i++) {
            const element = this.output.children[this.output.children.length - offset - i]
            if (!element) {
                return;
            }
            const msg = element.querySelector(".output_msg_text") as HTMLElement | null
            if (msg) {
                this.parseClickTags(msg)
            }
        }
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
