import type {PluginDefinition, PluginModalHandle, RegisterArkadiaPlugin} from "@client/src/plugins/api";

const definition: PluginDefinition = {
    name: "Dev UI demo",
    setup(api) {
        if (!api.ui?.registerMenuButton || !api.ui.openModal) {
            console.warn("Plugin UI helper is not available for the dev demo plugin.");
            return;
        }

        let modalHandle: PluginModalHandle | null = null;
        const disposeButton = api.ui.registerMenuButton({
            id: "dev-ui-demo",
            label: "Dev modal",
            title: "Show dev modal",
        }, () => {
            if (modalHandle) {
                modalHandle.show();
                return;
            }
            modalHandle = api.ui?.openModal?.({
                title: "Development modal",
                body: "This modal is rendered from a development plugin.",
            }) ?? null;
        });

        return () => {
            disposeButton?.();
            modalHandle?.dispose();
            modalHandle = null;
        };
    },
};

const register = window.registerArkadiaPlugin as RegisterArkadiaPlugin | undefined;
if (register) {
    register(definition);
} else {
    console.warn("registerArkadiaPlugin was not available for the dev demo plugin.");
}
