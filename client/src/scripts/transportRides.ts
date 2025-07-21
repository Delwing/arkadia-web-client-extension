// Transport ride progress management
import Client from "../Client";
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

interface Stop {
    start: number;
    destination: number;
    time: number;
    stop_pattern: string;
    set_pattern?: string;
    label?: string;
}

interface TransportDefinition {
    enter: string;
    exit?: string;
    start: string;
    exit_command?: string;
    bind?: string;
    stops: Stop[];
    show_path?: boolean;
}

interface MinimumTimes {
    [id: string]: { [index: number]: number };
}

class Ride {
    private stopTrigger: any = null;
    private progressContainer: HTMLElement | null = null;
    private progressBar: HTMLElement | null = null;
    private interval: number | null = null;
    private startTime: number = 0;

    constructor(
        private client: Client,
        public id: string,
        public def: TransportDefinition,
        public index: number,
        private onRemove: (ride: Ride) => void
    ) {
        this.setupTriggers();
    }

    private setupTriggers() {
        this.client.Triggers.registerOneTimeTrigger(this.def.enter, () => {
            this.onEnter();
            return undefined;
        }, 'transport-ride');
        if (this.def.exit) {
            this.client.Triggers.registerOneTimeTrigger(this.def.exit, () => {
                this.onExit();
                return undefined;
            }, 'transport-ride');
        }
        this.client.Triggers.registerOneTimeTrigger(this.def.start, () => {
            this.onStart();
            return undefined;
        }, 'transport-ride');
    }

    private onEnter() {
        // nothing for now
    }

    private onExit() {
        this.cleanup();
    }

    private onStart() {
        const stop = this.def.stops[this.index];
        if (this.stopTrigger) {
            this.client.Triggers.removeTrigger(this.stopTrigger);
        }
        this.stopTrigger = this.client.Triggers.registerOneTimeTrigger(new RegExp(stop.stop_pattern), () => {
            this.onStop();
            return undefined;
        }, 'transport-ride');
        this.startTime = Date.now();
        this.showProgress();
        this.interval = window.setInterval(() => this.updateProgress(), 250);
    }

    private onStop() {
        const stop = this.def.stops[this.index];
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        if (elapsed < stop.time) {
            storeNewMinimum(this.id, this.index, elapsed);
            stop.time = elapsed;
        }
        this.client.Map.setMapRoomById(stop.destination);
        this.hideProgress();
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.index = this.index >= this.def.stops.length - 1 ? 0 : this.index + 1;
        this.onRemove(this);
    }

    private showProgress() {
        this.progressContainer = document.createElement('div');
        this.progressContainer.style.position = 'absolute';
        this.progressContainer.style.bottom = '10px';
        this.progressContainer.style.right = '10px';
        this.progressContainer.style.width = '350px';
        this.progressContainer.style.height = '30px';
        this.progressContainer.style.border = '1px solid #666';
        this.progressContainer.style.background = '#222';
        this.progressBar = document.createElement('div');
        this.progressBar.style.height = '100%';
        this.progressBar.style.width = '0';
        this.progressBar.style.background = '#6a4';
        this.progressContainer.appendChild(this.progressBar);
        document.body.appendChild(this.progressContainer);
        this.updateProgress();
    }

    private updateProgress() {
        if (!this.progressBar) return;
        const stop = this.def.stops[this.index];
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const total = stop.time;
        const perc = Math.min(1, elapsed / total);
        this.progressBar.style.width = `${Math.floor(perc * 100)}%`;
        this.progressBar.textContent = `${stop.label ?? ''} ${elapsed}/${total}`.trim();
    }

    private hideProgress() {
        if (this.progressContainer) {
            this.progressContainer.remove();
            this.progressContainer = null;
            this.progressBar = null;
        }
    }

    cleanup() {
        if (this.stopTrigger) {
            this.client.Triggers.removeTrigger(this.stopTrigger);
            this.stopTrigger = null;
        }
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.hideProgress();
    }
}

function readMinimums(): MinimumTimes {
    try {
        const raw = localStorage.getItem('travel-times');
        return raw ? JSON.parse(raw) as MinimumTimes : {};
    } catch {
        return {};
    }
}

function storeMinimums(times: MinimumTimes) {
    localStorage.setItem('travel-times', JSON.stringify(times));
}

function storeNewMinimum(id: string, index: number, time: number) {
    const times = readMinimums();
    if (!times[id]) times[id] = {};
    if (!times[id][index] || time < times[id][index]) {
        times[id][index] = time;
        storeMinimums(times);
    }
}

export default function initTransportRides(client: Client) {
    const definitions: Record<string, TransportDefinition> = {
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
        WyzimaOxenfurt
    };

    const activeRides: Ride[] = [];

    function removeRide(ride: Ride) {
        const idx = activeRides.indexOf(ride);
        if (idx > -1) activeRides.splice(idx, 1);
        ride.cleanup();
    }

    function createRide(key: string, index: number) {
        const ride = new Ride(client, key, definitions[key], index, removeRide);
        activeRides.push(ride);
        return ride;
    }

    const minimums = readMinimums();
    Object.entries(definitions).forEach(([key, def]) => {
        def.stops.forEach((stop, idx) => {
            if (minimums[key] && minimums[key][idx] !== undefined) {
                stop.time = Math.min(stop.time, Number(minimums[key][idx]));
            }
            if (stop.set_pattern) {
                const regex = new RegExp(stop.set_pattern);
                client.Triggers.registerTrigger(regex, () => {
                    const id = client.Map.currentRoom?.id;
                    if (id === stop.start) {
                        if (!activeRides.find(r => r.id === key && r.index === idx)) {
                            createRide(key, idx);
                        }
                    }
                    return undefined;
                }, 'transport-ride');
            }
        });
    });
}
