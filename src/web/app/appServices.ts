import { createContext, useContext } from "react";
import type Client from "@client/Client";
import type { HelperConnection } from "@modules/helper/HelperConnection";
import type { AccountSession } from "../account/accountSession";
import type { ConnectionController } from "../connection/connectionController";

/** What the page's components share: built once in main.ts, before React renders. */
export interface AppServices {
    client: Client;
    helperConnection: HelperConnection;
    connection: ConnectionController;
    accountSession: AccountSession;
}

export const AppServicesContext = createContext<AppServices | null>(null);

export function useAppServices(): AppServices {
    const services = useContext(AppServicesContext);
    if (!services) {
        throw new Error("useAppServices must be used under <AppProviders>");
    }
    return services;
}
