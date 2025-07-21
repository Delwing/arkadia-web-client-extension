import Client from "./Client";

export default class OutputHandler {

    client: Client
    output = document.getElementById("main_text_output_msg_wrapper")
    clickerCallbacks: Function[] = [];

    constructor(clientExtension: Client) {
        this.client = clientExtension
        this.client.addEventListener('output-sent', (event: CustomEvent) => {
            this.processOutput(event);
        })
        this.client.addEventListener('buffer-sent', (event: CustomEvent) => {
                this.processOutput(event);
            }
        )
    }

    private decorateClickable(span: HTMLElement, cbIndex: number, title?: string) {
        span.style.cursor = "pointer"
        span.style.textDecoration = " underline"
        span.style.textDecorationStyle = "dotted"
        span.style.textDecorationSkipInk = "auto"
        if (title) {
            span.title = title
        }
        const cb = this.clickerCallbacks[cbIndex]
        this.clickerCallbacks[cbIndex] = undefined as any
        span.onclick = () => {
            cb?.apply(null)
        }
    }

    private parseSpanMarker(el: HTMLElement) {
        const clickIndex = el.textContent.indexOf("{click:")
        if (clickIndex === -1) {
            return
        }
        const clickTitleSeparator = el.textContent.indexOf(":", clickIndex + 7)
        const closerIndex = el.textContent.indexOf("}", clickIndex)
        const hasTitle = clickTitleSeparator > clickIndex && clickTitleSeparator < closerIndex
        const title = hasTitle ? el.textContent.substring(clickTitleSeparator + 1, closerIndex) : undefined
        const callbackIndex = parseInt(el.textContent.substring(clickIndex + 7, hasTitle ? clickTitleSeparator : closerIndex))
        el.textContent = el.textContent.substring(0, clickIndex) + el.textContent.substring(closerIndex + 1)
        this.decorateClickable(el, callbackIndex, title)
    }

    private parseTextNodes(msg: HTMLElement) {
        if (!msg.textContent || msg.textContent.indexOf("{click:") === -1) {
            return
        }
        const clickReg = /\{click:(\d+)(?::([^}]+))?\}/
        Array.from(msg.childNodes).forEach((node) => {
            if (node.nodeType !== Node.TEXT_NODE) {
                return
            }
            let text = node.textContent || ""
            let match = clickReg.exec(text)
            if (!match) {
                return
            }
            const frag = document.createDocumentFragment()
            while (match) {
                const before = text.substring(0, match.index)
                if (before) {
                    frag.appendChild(document.createTextNode(before))
                }
                text = text.substring(match.index + match[0].length)
                const nextMatch = clickReg.exec(text)
                const nextIndex = nextMatch ? nextMatch.index : text.length
                const clickableText = text.substring(0, nextIndex)
                const span = document.createElement("span")
                span.textContent = clickableText
                this.decorateClickable(span, parseInt(match[1]), match[2])
                frag.appendChild(span)
                text = text.substring(nextIndex)
                match = nextMatch
            }
            if (text) {
                frag.appendChild(document.createTextNode(text))
            }
            node.replaceWith(frag)
        })
    }

    private processOutput(event: CustomEvent) {
        if (!this.output.children) {
            return
        }
        for (let i = 0; i < event.detail; i++) {
            const element = this.output.children[this.output.children.length - 2 - i]
            if (!element) {
                return;
            }
            const msg = element.querySelector(".output_msg_text") as HTMLElement | null
            if (msg) {
                const elements: HTMLElement[] = Array.from(msg.querySelectorAll("span")) as HTMLElement[]
                elements.filter(el => el.textContent.indexOf("click:") > -1).forEach(el => {
                    this.parseSpanMarker(el)
                })
                this.parseTextNodes(msg)
            }
        }
    }

    makeStringClickable(string: string, callback: Function, title?: string) {
        this.clickerCallbacks.push(callback)
        return `{click:${this.clickerCallbacks.length - 1}${title ? ":" + title : ""}}${string}`
    }

    makeClickable(rawLine: string, string: string, callback: Function, title?: string) {
        const matchIndex = rawLine.indexOf(string)
        this.clickerCallbacks.push(callback)
        return rawLine.substring(0, matchIndex) + `{click:${this.clickerCallbacks.length - 1}${title ? ":" + title : ""}}${string}` + rawLine.substring(matchIndex + string.length)
    }
}