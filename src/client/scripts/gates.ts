import Client from "../Client";

export default function initGates(client: Client) {
    const knock = () => {
        client.sendCommand("zastukaj we wrota");
    };
    client.FunctionalBind.set(null, knock);

    const showMessage = () => {
        client.FunctionalBind.set("zastukaj we wrota", knock);
        return undefined;
    };

    const patterns = [
        /^Probujesz otworzyc .*wrota.*/,
        /^Probujesz otworzyc .*drzwiczki.*/,
        /^Probujesz otworzyc .*krate.*/,
        /^Probujesz otworzyc .*brame.*/,
        /^Probujesz otworzyc niewielka furtke.*/,
    ];

    patterns.forEach(p => client.Triggers.registerTrigger(p, showMessage, "gates"));
}

