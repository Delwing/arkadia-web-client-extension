import ArkadiaClient from "./ArkadiaClient.ts";

export default class TelnetOptionNegotiation {

    client: typeof ArkadiaClient;

    IAC = String.fromCharCode(255);
    WILL = String.fromCharCode(251);
    WONT = String.fromCharCode(252);
    DO = String.fromCharCode(253);
    DONT = String.fromCharCode(254);
    GMCP_OPTION = String.fromCharCode(201);
    MCCP_OPTION = String.fromCharCode(86);

    options = {
        gmcp: false,
        mccp: false,
        opt_mccp: false
    }

    constructor(client: typeof ArkadiaClient) {
        this.client = client;
    }

    initializeProtocols() {
        this.send(this.IAC + this.DO + this.MCCP_OPTION);
        this.send(this.IAC + this.DO + this.GMCP_OPTION);
    }

    send(data: string) {
        this.client.sendRaw(btoa(data));
    }

    handleWillOption(option) {
        switch (option) {
            case this.GMCP_OPTION:
                if (!this.options.gmcp) {
                    this.send(this.IAC + this.DO + option);
                    this.options.gmcp = true;
                }
                break;
            case this.MCCP_OPTION:
                if (!this.options.mccp) {
                    this.send(this.IAC + this.DO + option);
                    this.options.mccp = true;
                }
        }
    }

    parseOptionNegotiation(data: string) {
        var command = data[1];
        var option = data[2];

        switch (command) {
            case this.WILL:
                this.handleWillOption(option);
                break;
            case this.WONT:
                this.handleWontOption(option);
                break;
            case this.DO:
                this.handleDoOption(option);
                break;
            case this.DONT:
                this.handleDontOption(option);
                break;
        }
    }

    handleWontOption(option) {
        switch (option) {
            case this.GMCP_OPTION:
                this.options.gmcp = false;
                break;
            case this.MCCP_OPTION:
                this.options.mccp = false;
                this.options.opt_mccp = false;
                break;
        }
    }

    handleDoOption(option) {
        this.send(this.IAC + this.WONT + option);
    }

    handleDontOption(option) {}


}