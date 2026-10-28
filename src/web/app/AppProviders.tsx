import type { ReactNode } from "react";
import { AppServicesContext, type AppServices } from "./appServices";

export function AppProviders({ services, children }: { services: AppServices; children?: ReactNode }) {
    return <AppServicesContext.Provider value={services}>{children}</AppServicesContext.Provider>;
}
