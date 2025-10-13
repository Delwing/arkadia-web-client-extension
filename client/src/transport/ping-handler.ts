import WebSocketTransportAdapter from "./websocket-adapter";

export default class PingHandler {

    private pingTimer: number | null = null;
    private webSocketTransportAdapter: WebSocketTransportAdapter


    constructor(webSocketTransportAdapter: WebSocketTransportAdapter) {
        this.webSocketTransportAdapter = webSocketTransportAdapter;
        this.webSocketTransportAdapter.subject.subscribe((event => {
            switch (event.type) {
                case "open":
                    this.startPing();
                    break;
                case "close":
                    this.stopPing();
                    break;
            }
        }))
    }

    private startPing() {
        this.stopPing();
        this.sendPing();
        this.pingTimer = window.setInterval(() => {
            this.sendPing();
        }, 30000);
    }

    private sendPing() {
        this.webSocketTransportAdapter.sendGmcp("core.ping");
    }

    private stopPing() {
        if (this.pingTimer !== null) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

}