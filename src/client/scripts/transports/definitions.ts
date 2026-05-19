// Shared transport definitions loaded from the per-transport JSON files.
// Consumed by transportTracker (state machine + triggers) and by the
// transport-aware pathfinder.

import Ancelmus from "../ships/Ancelmus.json";
import Annibale from "../ships/Annibale.json";
import Asa from "../ships/Asa.json";
import Batista from "../ships/Batista.json";
import Bjorn from "../ships/Bjorn.json";
import Cern from "../ships/Cern.json";
import Charonda from "../ships/Charonda.json";
import Creyard from "../ships/Creyard.json";
import Daniel from "../ships/Daniel.json";
import Elich from "../ships/Elich.json";
import Flavius from "../ships/Flavius.json";
import Francois from "../ships/Francois.json";
import Gervais from "../ships/Gervais.json";
import Gmeath from "../ships/Gmeath.json";
import Gvidon from "../ships/Gvidon.json";
import Hallgerda from "../ships/Hallgerda.json";
import Haming from "../ships/Haming.json";
import Jacob from "../ships/Jacob.json";
import Kelim from "../ships/Kelim.json";
import Louis from "../ships/Louis.json";
import Luiggi from "../ships/Luiggi.json";
import Malacius from "../ships/Malacius.json";
import Mallcolm from "../ships/Mallcolm.json";
import Olaf from "../ships/Olaf.json";
import Pluskolec from "../ships/Pluskolec.json";
import Rygwit from "../ships/Rygwit.json";
import Strag from "../ships/Strag.json";
import BialyMostHagge from "../other/Bialy Most - Hagge.json";
import CarrerasRiviaScala from "../other/Carreras - Rivia - Scala.json";
import Jouinard from "../other/Jouinard - Nuln.json";
import KrainaZgromadzenia from "../other/Kraina Zgromadzenia - Nuln.json";
import MariborGrabowa from "../other/Maribor - Grabowa Buchta.json";
import PodgrodzieTretogoruGelibol from "../other/Podgrodzie Tretogoru - Gelibol.json";
import MariborObawa from "../other/Maribor - Obawa.json";
import Salignac from "../other/Salignac - Nuln.json";
import NulnBlekitnaWstega from "../other/Nuln - Blekitna Wstega.json";
import Varieno from "../other/Varieno - Miragliano - Campogrotta.json";
import NovigradOxenfurt from "../other/Novigrad - Oxenfurt.json";
import WyzimaOxenfurt from "../other/Wyzima - Oxenfurt.json";
import QuenellesMontlacMerceauxDesclouxParravon from "../other/Quenelles - Montlac - Merceaux-Descloux - Parravon.json";
import UrbimoToscania from "../other/Urbimo - Toscania.json";

export interface RawTransportStop {
    start: number;
    destination: number;
    time?: number;
    stop_pattern?: string | string[];
    stop_pattern_outside?: string;
    stop_pattern_inside?: string;
    set_pattern?: string;
    label?: string;
}

export interface RawTransportDefinition {
    label?: string;
    enter?: string;
    exit?: string;
    start?: string;
    stop_pattern?: string | string[];
    bind?: string;
    exit_command?: string;
    show_path?: boolean;
    board_commands?: string[];
    standing_patterns?: string[];
    stops: RawTransportStop[];
}

export const RAW_TRANSPORT_DEFINITIONS: Array<[string, RawTransportDefinition]> = [
    ["Ancelmus", Ancelmus as RawTransportDefinition], ["Annibale", Annibale as RawTransportDefinition],
    ["Asa", Asa as RawTransportDefinition], ["Batista", Batista as RawTransportDefinition],
    ["Bjorn", Bjorn as RawTransportDefinition], ["Cern", Cern as RawTransportDefinition],
    ["Charonda", Charonda as RawTransportDefinition], ["Creyard", Creyard as RawTransportDefinition],
    ["Daniel", Daniel as RawTransportDefinition], ["Elich", Elich as RawTransportDefinition],
    ["Flavius", Flavius as RawTransportDefinition], ["Francois", Francois as RawTransportDefinition],
    ["Gervais", Gervais as RawTransportDefinition], ["Gmeath", Gmeath as RawTransportDefinition],
    ["Gvidon", Gvidon as RawTransportDefinition], ["Hallgerda", Hallgerda as RawTransportDefinition],
    ["Haming", Haming as RawTransportDefinition], ["Jacob", Jacob as RawTransportDefinition],
    ["Kelim", Kelim as RawTransportDefinition], ["Louis", Louis as RawTransportDefinition],
    ["Luiggi", Luiggi as RawTransportDefinition], ["Malacius", Malacius as RawTransportDefinition],
    ["Mallcolm", Mallcolm as RawTransportDefinition], ["Olaf", Olaf as RawTransportDefinition],
    ["Pluskolec", Pluskolec as RawTransportDefinition], ["Rygwit", Rygwit as RawTransportDefinition],
    ["Strag", Strag as RawTransportDefinition],
    ["Bialy Most - Hagge", BialyMostHagge as RawTransportDefinition],
    ["Carreras - Rivia - Scala", CarrerasRiviaScala as RawTransportDefinition],
    ["Jouinard - Nuln", Jouinard as RawTransportDefinition],
    ["Kraina Zgromadzenia - Nuln", KrainaZgromadzenia as RawTransportDefinition],
    ["Maribor - Grabowa Buchta", MariborGrabowa as RawTransportDefinition],
    ["Podgrodzie Tretogoru - Gelibol", PodgrodzieTretogoruGelibol as RawTransportDefinition],
    ["Maribor - Obawa", MariborObawa as RawTransportDefinition],
    ["Salignac - Nuln", Salignac as RawTransportDefinition],
    ["Nuln - Blekitna Wstega", NulnBlekitnaWstega as RawTransportDefinition],
    ["Varieno - Miragliano - Campogrotta", Varieno as RawTransportDefinition],
    ["Novigrad - Oxenfurt", NovigradOxenfurt as RawTransportDefinition],
    ["Wyzima - Oxenfurt", WyzimaOxenfurt as RawTransportDefinition],
    ["Quenelles - Montlac - Merceaux-Descloux - Parravon", QuenellesMontlacMerceauxDesclouxParravon as RawTransportDefinition],
    ["Urbimo - Toscania", UrbimoToscania as RawTransportDefinition],
];

// Pathfinder-facing view: just the data needed to plan a route. Strips
// regex/state-machine concerns that only the tracker cares about.
export interface TransportStop {
    start: number;
    destination: number;
    time?: number;
    label?: string;
}

export interface TransportDef {
    name: string;
    boardCommands: string[];
    exitCommand?: string;
    stops: TransportStop[];
}

export function getTransportDefs(): TransportDef[] {
    return RAW_TRANSPORT_DEFINITIONS.map(([fileKey, raw]) => ({
        name: raw.label ?? fileKey,
        boardCommands: raw.board_commands ?? [],
        exitCommand: raw.exit_command,
        stops: raw.stops.map(s => ({
            start: s.start,
            destination: s.destination,
            time: s.time,
            label: s.label?.trim() || undefined,
        })),
    }));
}
