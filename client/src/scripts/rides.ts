import Client from "../Client";

interface Stop {
    start: number;
    destination: number;
    time: number;
    stop_pattern: string;
    set_pattern?: string;
    label?: string;
}

interface RideDefinition {
    enter: string;
    exit?: string;
    start: string;
    bind?: string;
    stops: Stop[];
}

// Ship definitions
import Ancelmus from './ships/Ancelmus.json';
import Annibale from './ships/Annibale.json';
import Asa from './ships/Asa.json';
import Batista from './ships/Batista.json';
import Bjorn from './ships/Bjorn.json';
import Cern from './ships/Cern.json';
import Charonda from './ships/Charonda.json';
import Creyard from './ships/Creyard.json';
import Daniel from './ships/Daniel.json';
import Elich from './ships/Elich.json';
import Flavius from './ships/Flavius.json';
import Francois from './ships/Francois.json';
import Gervais from './ships/Gervais.json';
import Gmeath from './ships/Gmeath.json';
import Gvidon from './ships/Gvidon.json';
import Hallgerda from './ships/Hallgerda.json';
import Haming from './ships/Haming.json';
import Jacob from './ships/Jacob.json';
import Kelim from './ships/Kelim.json';
import Louis from './ships/Louis.json';
import Luiggi from './ships/Luiggi.json';
import Malacius from './ships/Malacius.json';
import Mallcolm from './ships/Mallcolm.json';
import Olaf from './ships/Olaf.json';
import Pluskolec from './ships/Pluskolec.json';
import Rygwit from './ships/Rygwit.json';
import Strag from './ships/Strag.json';

import Jouinard from './other/Jouinard - Nuln.json';
import KrainaZgromadzenia from './other/Kraina Zgromadzenia - Nuln.json';
import MariborGrabowa from './other/Maribor - Grabowa Buchta.json';
import Salignac from './other/Salignac - Nuln.json';
import Varieno from './other/Varieno - Miragliano - Campogrotta.json';
import WyzimaOxenfurt from './other/Wyzima - Oxenfurt.json';

const definitions: Record<string, RideDefinition> = {
    Ancelmus,
    Annibale,
    Asa,
    Batista,
    Bjorn,
    Cern,
    Charonda,
    Creyard,
    Daniel,
    Elich,
    Flavius,
    Francois,
    Gervais,
    Gmeath,
    Gvidon,
    Hallgerda,
    Haming,
    Jacob,
    Kelim,
    Louis,
    Luiggi,
    Malacius,
    Mallcolm,
    Olaf,
    Pluskolec,
    Rygwit,
    Strag,
    Jouinard,
    KrainaZgromadzenia,
    MariborGrabowa,
    Salignac,
    Varieno,
    WyzimaOxenfurt,
};

const ENTER_COMMANDS = [
    'wsiadz na statek',
    'wejdz na statek',
    'wejdz na prom',
    'wsiadz na prom',
    'wsiadz do dylizansu',
    'wsiadz do wozu',
    'wjedz na statek',
];

interface RideInstance {
    id: string;
    definition: RideDefinition;
    index: number;
    onBoard: boolean;
}

export default function initRides(client: Client) {
    const activeRides: RideInstance[] = [];
    const locationToDefinition: Record<number, string> = {};

    Object.entries(definitions).forEach(([id, def]) => {
        def.stops.forEach((stop, idx) => {
            locationToDefinition[stop.start] = id;
            if (stop.set_pattern) {
                const regex = new RegExp(stop.set_pattern);
                client.Triggers.registerTrigger(regex, () => {
                    if (client.Map.currentRoom?.id === stop.start) {
                        const existing = activeRides.find(r => r.id === id && r.index === idx);
                        if (!existing) {
                            activeRides.push(createRide(id, def, idx));
                        }
                    }
                    return undefined;
                }, 'ride-setup');
            }
        });
    });

    function findRide() {
        if (activeRides.length > 0) return;
        const loc = client.Map.currentRoom?.id;
        if (!loc) return;
        const key = locationToDefinition[loc];
        if (!key) return;
        const def = definitions[key];
        def.stops.forEach((stop, idx) => {
            if (stop.start === loc) {
                const existing = activeRides.find(r => r.id === key && r.index === idx);
                if (!existing) {
                    activeRides.push(createRide(key, def, idx));
                }
            }
        });
    }

    const enterPattern = new RegExp(`^(${ENTER_COMMANDS.join('|')})$`);
    client.aliases.push({
        pattern: enterPattern,
        callback: (m: RegExpMatchArray) => {
            findRide();
            client.send(m[1]);
        },
    });

    function createRide(id: string, def: RideDefinition, index: number): RideInstance {
        const ride: RideInstance = { id, definition: def, index, onBoard: false };

        client.Triggers.registerTrigger(new RegExp(def.enter), () => {
            ride.onBoard = true;
            if (def.bind) {
                client.FunctionalBind.set(def.bind);
            }
            return undefined;
        }, 'ride');

        if (def.exit) {
            client.Triggers.registerTrigger(new RegExp(def.exit), () => {
                ride.onBoard = false;
                client.FunctionalBind.set(null);
                return undefined;
            }, 'ride');
        }

        client.Triggers.registerTrigger(new RegExp(def.start), () => {
            if (!ride.onBoard) return undefined;
            const stop = def.stops[ride.index];
            client.Triggers.registerOneTimeTrigger(new RegExp(stop.stop_pattern), () => {
                client.Map.setMapRoomById(stop.destination);
                ride.index = ride.index >= def.stops.length - 1 ? 0 : ride.index + 1;
                return undefined;
            }, 'ride');
            return undefined;
        }, 'ride');

        return ride;
    }
}

