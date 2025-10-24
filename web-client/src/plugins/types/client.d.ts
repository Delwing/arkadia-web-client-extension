declare module "@client/src/Client" {
    export interface CommandOptions {
        preserveCase?: boolean;
    }

    export default interface Client {
        sendCommand(command: string, echo?: boolean, options?: CommandOptions): void;
        send(command: string, echo?: boolean, options?: CommandOptions): void;
        addEventListener(event: string, listener: (ev: CustomEvent) => void, options?: AddEventListenerOptions | boolean): void;
        removeEventListener(event: string, listener: EventListenerOrEventListenerObject | null): void;
        sendEvent(type: string, payload?: any): void;
        print(text: string): void;
        println(text: string): void;
    }
}
