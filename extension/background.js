const defaultSettings = {
    prettyContainers: true,
    emojiLabels: false,
    collectMode: 3,
    collectMoneyType: 1,
    collectExtra: [],
    mapLeft: null,
    mapTop: null,
    mapWidth: null,
    mapHeight: null,
    xtermPalette: 'arkadia',
    shortenExits: false,
    binds: {
        main: { key: 'BracketRight' },
        lamp: { key: 'Digit4', ctrl: true },
        gates: { key: 'Digit2', ctrl: true },
        collector: { key: 'Digit3', ctrl: true },
        directions: {
            n: { key: 'Numpad8' },
            s: { key: 'Numpad2' },
            w: { key: 'Numpad4' },
            e: { key: 'Numpad6' },
            nw: { key: 'Numpad7' },
            ne: { key: 'Numpad9' },
            sw: { key: 'Numpad1' },
            se: { key: 'Numpad3' },
            u: { key: 'NumpadMultiply' },
            d: { key: 'NumpadSubtract' },
            special: { key: 'Numpad0' },
        }
    }
}

chrome.commands.onCommand.addListener(shortcut => {
    if (shortcut === 'reload') {
        chrome.runtime.reload()
    }
})

chrome.runtime.onConnectExternal.addListener(function (port) {
    chrome.storage.local.onChanged.addListener(msg => {
        Object.entries(msg).forEach(([key, value]) => {
            if (key === 'settings' || key === 'npc') {
                port.postMessage({ [key]: value.newValue })
            }
            port.postMessage({ storage: { key, value: value.newValue } })
        })
    })

    chrome.storage.local.get(null).then(items => {
        Object.entries(items).forEach(([key, value]) => {
            if (key === 'npc') {
                port.postMessage({ [key]: value })
            }
            if (key !== 'settings' && key !== 'kill_counter') {
                port.postMessage({ storage: { key, value } })
            }
        })
    })

    port.onMessage.addListener(msg => {
        if (msg.type === 'NEW_NPC') {
            chrome.storage.local.get('npc').then(data => {
                const npc = data.npc ?? []
                npc.push({name: msg.name, loc: msg.loc})
                chrome.storage.local.set({ npc: npc })
            })
        }
        if (msg.type === 'GET_STORAGE') {
            chrome.storage.local.get(msg.key).then(data => {
                let value = data[msg.key]
                if (msg.key === 'settings') {
                    value = { ...defaultSettings, ...value }
                }
                if (msg.key === 'settings' || msg.key === 'npc') {
                    port.postMessage({ [msg.key]: value })
                }
                port.postMessage({ storage: { key: msg.key, value } })
            })
        }
        if (msg.type === 'SET_STORAGE') {
            const entry = {}
            entry[msg.key] = msg.value
            chrome.storage.local.set(entry)
        }
    })
});


function loadIframe(tabId) {
    chrome.scripting.executeScript({
        target: {tabId: tabId},
        func: async () => {
            const defaultSettings = {
                prettyContainers: true,
                emojiLabels: false,
                collectMode: 3,
                collectMoneyType: 1,
                collectExtra: [],
                mapLeft: null,
                mapTop: null,
                mapWidth: null,
                mapHeight: null,
                xtermPalette: 'arkadia',
                shortenExits: false,
                binds: {
                    main: { key: 'BracketRight' },
                    lamp: { key: 'Digit4', ctrl: true },
                    gates: { key: 'Digit2', ctrl: true },
                    collector: { key: 'Digit3', ctrl: true },
                    directions: {
                        n: { key: 'Numpad8' },
                        s: { key: 'Numpad2' },
                        w: { key: 'Numpad4' },
                        e: { key: 'Numpad6' },
                        nw: { key: 'Numpad7' },
                        ne: { key: 'Numpad9' },
                        sw: { key: 'Numpad1' },
                        se: { key: 'Numpad3' },
                        u: { key: 'NumpadMultiply' },
                        d: { key: 'NumpadSubtract' },
                        special: { key: 'Numpad0' },
                    }
                }
            }

            let download = async (url, ttl) => {
                return chrome.storage.local.get(url).then(item => {
                    const cacheContent = item[url]
                    if (cacheContent && cacheContent.value && cacheContent.cacheTime && cacheContent.cacheTime + cacheContent.ttl > Date.now()) {
                        return cacheContent.value;
                    } else {
                        return fetch(url).then(data => data.json()).then(data => {
                            let entry = {}
                            entry[url] = {value: data, cacheTime: Date.now(), ttl: ttl}
                            chrome.storage.local.set(entry)
                            return data;
                        })
                    }
                })
            }

            const size = 355
            const oldIframe = document.getElementById('map-placeholder');

            if (oldIframe) {
                oldIframe.remove();
            }
            const rightPanel = document.body.querySelector("#panel_elems_right")

            const div = document.createElement('div')
            div.setAttribute('style', `width: ${size}px;height: ${size}px; position: fixed; right: 255px; top: 60px; overflow: visible;`);
            div.setAttribute('id', 'map-placeholder')

            const dragHandle = document.createElement('div')
            dragHandle.textContent = 'Drag'
            dragHandle.setAttribute('style', 'position:absolute;top:0;left:0;right:0;height:16px;cursor:move;background:rgba(50,50,50,0.5);border-bottom:1px solid #888;color:#fff;font-size:10px;line-height:16px;text-align:center;z-index:10;display:none;')
            div.appendChild(dragHandle)

            const resizeHandle = document.createElement('div')
            resizeHandle.setAttribute('style', 'position:absolute;width:16px;height:16px;right:0;bottom:0;cursor:se-resize;background:rgba(50,50,50,0.5);border-left:1px solid #888;border-top:1px solid #888;z-index:10;display:none;')
            div.appendChild(resizeHandle)

            div.addEventListener('mouseenter', () => {
                dragHandle.style.display = 'block'
                resizeHandle.style.display = 'block'
            })
            div.addEventListener('mouseleave', () => {
                dragHandle.style.display = 'none'
                resizeHandle.style.display = 'none'
            })

            const iframe = document.createElement('iframe');
            iframe.setAttribute('id', 'cm-frame');
            iframe.setAttribute('style', `width: 100%;height: 100%; border: 1px solid #323232;`);
            iframe.setAttribute('allow', '');
            iframe.src = chrome.runtime.getURL('embedded.html');

            const enableDragResize = (container, drag, resize) => {
                let startX, startY, startWidth, startHeight, offsetX, offsetY
                let mode = null

                const onMove = ev => {
                    if (mode === 'drag') {
                        container.style.left = ev.clientX - offsetX + 'px'
                        container.style.top = ev.clientY - offsetY + 'px'
                    } else if (mode === 'resize') {
                        container.style.width = startWidth + (ev.clientX - startX) + 'px'
                        container.style.height = startHeight + (ev.clientY - startY) + 'px'
                    }
                }

                const onUp = () => {
                    document.removeEventListener('mousemove', onMove)
                    document.removeEventListener('mouseup', onUp)
                    if (mode === 'drag' || mode === 'resize') {
                        const left = parseInt(container.style.left, 10)
                        const top = parseInt(container.style.top, 10)
                        const width = container.offsetWidth
                        const height = container.offsetHeight
                        chrome.storage.local.get('settings').then(d => {
                            const current = d.settings || {}
                            chrome.storage.local.set({ settings: { ...current, mapLeft: left, mapTop: top, mapWidth: width, mapHeight: height } })
                        })
                    }
                    mode = null
                }

                drag.addEventListener('mousedown', e => {
                    e.preventDefault()
                    const rect = container.getBoundingClientRect()
                    offsetX = e.clientX - rect.left
                    offsetY = e.clientY - rect.top
                    container.style.left = rect.left + 'px'
                    container.style.top = rect.top + 'px'
                    container.style.right = 'auto'
                    mode = 'drag'
                    document.addEventListener('mousemove', onMove)
                    document.addEventListener('mouseup', onUp)
                })

                resize.addEventListener('mousedown', e => {
                    e.preventDefault()
                    startX = e.clientX
                    startY = e.clientY
                    startWidth = container.offsetWidth
                    startHeight = container.offsetHeight
                    mode = 'resize'
                    document.addEventListener('mousemove', onMove)
                    document.addEventListener('mouseup', onUp)
                })
            }

            div.appendChild(iframe)

            rightPanel.prepend(div);
            enableDragResize(div, dragHandle, resizeHandle)

            Promise.all([
                download('https://delwing.github.io/arkadia-mapa/data/mapExport.json', 60 * 60 * 24),
                download('https://delwing.github.io/arkadia-mapa/data/colors.json', 60 * 60 * 24)
            ]).then(([mapData, colors]) => {
                window.dispatchEvent(new CustomEvent('map-ready', {detail: {mapData, colors}}))
                iframe.contentWindow?.dispatchEvent(new CustomEvent('extension-message', {detail: {mapData: mapData, colors: colors}}))
            })

            let init = (settings) => {
                const replaceMap = settings?.replaceMap
                const baseSize = replaceMap ? 215 : 355;
                const map = document.getElementById('map-placeholder')
                document.getElementById('minimap_output').style.display = replaceMap ? 'none' : 'block';
                let positionPart = ''
                if (!replaceMap) {
                    if (settings.mapLeft !== null && settings.mapTop !== null) {
                        positionPart = ` position: fixed; left: ${settings.mapLeft}px; top: ${settings.mapTop}px;`
                    } else {
                        positionPart = ' position: fixed; right: 255px; top: 60px;'
                    }
                }
                const width = settings.mapWidth ?? baseSize
                const height = settings.mapHeight ?? baseSize
                map.setAttribute('style', `width: ${width}px;height: ${height}px;${positionPart} overflow: visible;`)
            }

            chrome.storage.local.get('settings').then(value => {
                init({ ...defaultSettings, ...value.settings });
                window.dispatchEvent(new CustomEvent('ready'))
            })
            chrome.storage.local.onChanged.addListener(ev => {
                if (ev.settings) {
                    init({ ...defaultSettings, ...ev.settings.newValue })
                }
            })

            const buttonPanel = document.body.querySelector('#panel_bottom')

            const newPanel = document.createElement('div')
            newPanel.setAttribute('id', 'additional-buttons')
            buttonPanel.appendChild(newPanel)

            window.dispatchEvent(new CustomEvent('extension-loaded', {detail: chrome.runtime.id}))
        }
    })
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message === 'ready') {
        loadIframe(sender.tab.id);
    }
});
