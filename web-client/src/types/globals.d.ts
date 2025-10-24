import Client from "@client/src/Client";

interface ClientInput {
    send(command: string): void;
}

interface ClientOutput {
    buffer: string[];
    send(out?: string, type?: string): any;
    clear(): void
}


interface ClientMap {
    refresh_position(): void

    set_position(position: Position): void

    unset_position(): void

    data?: Position
}

interface ClientText {
    parse_patterns(text: string): string
}

interface ClientGmcp {
    parse_option_subnegotiation(subnegotiation: string): void
}


interface ClientConf {

}

interface FakeClient extends Client {
    fake: Function
}


declare global {
    interface Window {
        Input: ClientInput;
        Output: ClientOutput;
        Maps: ClientMap;
        Text: ClientText;
        Conf: ClientConf
        Gmcp: ClientGmcp;
        clientExtension: Client
    }

    declare var Input: ClientInput;
    declare var Maps: ClientMap;
    declare var Gmcp: ClientGmcp;
    declare var Output: ClientOutput;
    declare var Text: ClientText;

    interface Position {
        x: number;
        y: number;
        z: number;
        id: string;
        name: string;
    }
}