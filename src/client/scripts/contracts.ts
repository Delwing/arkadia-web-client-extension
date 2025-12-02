import Client from "@client/Client.ts";
import eventBus from "@modules/core/eventBus.ts";
import {getItemSync, setItemSync} from "@modules/core/storage.ts";

export interface Contract {
    id: string;
    locationId: number | null;
    location: string;
    type: string;
    item: string;
    count: number;
    quality?: string;
    deadlineTimestamp: number;
    createdAt: number;
}

export interface ContractsSnapshot {
    contracts: Contract[];
    lastCleanup: number;
}

const STORAGE_KEY = 'contracts';

const POLISH_NUMBERS: Record<string, number> = {
    jednej: 1,
    jednego: 1,
    jeden: 1,
    dwoch: 2,
    dwu: 2,
    dwie: 2,
    dwoje: 2,
    trzech: 3,
    trzy: 3,
    czterech: 4,
    cztery: 4,
    pieciu: 5,
    piec: 5,
    szesciu: 6,
    szesc: 6,
    siedmiu: 7,
    siedem: 7,
    osmiu: 8,
    osiem: 8,
    dziewieciu: 9,
    dziewiec: 9,
    dziesieciu: 10,
    dziesiec: 10,
    jedenastu: 11,
    jedenascie: 11,
    dwunastu: 12,
    dwanascie: 12,
    trzynastu: 13,
    trzynascie: 13,
    czternastu: 14,
    czternascie: 14,
    pietnastu: 15,
    pietnascie: 15,
    szesnastu: 16,
    szesnascie: 16,
    siedemnastu: 17,
    siedemnascie: 17,
    osiemnastu: 18,
    osiemnascie: 18,
    dziewietnastu: 19,
    dziewietnascie: 19,
    dwudziestu: 20,
    dwadziescia: 20,
    "dwudziestu jeden": 21,
    "dwudziestu jednej": 21,
    "dwudziestu jednego": 21,
    "dwudziestu dwoch": 22,
    "dwudziestu dwu": 22,
    "dwudziestu trzech": 23,
    "dwudziestu czterech": 24,
    "dwudziestu pieciu": 25,
    "dwudziestu szesciu": 26,
    "dwudziestu siedmiu": 27,
    "dwudziestu osmiu": 28,
    "dwudziestu dziewieciu": 29,
    trzydziestu: 30,
    trzydziesci: 30,
    "trzydziestu jeden": 31,
    "trzydziestu jednej": 31,
    "trzydziestu jednego": 31,
    "trzydziestu dwoch": 32,
    "trzydziestu dwu": 32,
    "trzydziestu trzech": 33,
    "trzydziestu czterech": 34,
    "trzydziestu pieciu": 35,
    "trzydziestu szesciu": 36,
    "trzydziestu siedmiu": 37,
    "trzydziestu osmiu": 38,
    "trzydziestu dziewieciu": 39,
    czterdziestu: 40,
    czterdziesci: 40,
    "czterdziestu jeden": 41,
    "czterdziestu jednej": 41,
    "czterdziestu jednego": 41,
    "czterdziestu dwoch": 42,
    "czterdziestu dwu": 42,
    "czterdziestu trzech": 43,
    "czterdziestu czterech": 44,
    "czterdziestu pieciu": 45,
    "czterdziestu szesciu": 46,
    "czterdziestu siedmiu": 47,
    "czterdziestu osmiu": 48,
    "czterdziestu dziewieciu": 49,
    pieedziesieciu: 50,
    piedziesiat: 50,
};

const POLISH_DAYS: Record<string, number> = {
    jeden: 1,
    dwa: 2,
    trzy: 3,
    cztery: 4,
    piec: 5,
    szesc: 6,
    siedem: 7,
    osiem: 8,
    dziewiec: 9,
    dziesiec: 10,
    jedenascie: 11,
    dwanascie: 12,
    trzynascie: 13,
    czternascie: 14,
    pietnascie: 15,
    szesnascie: 16,
    siedemnascie: 17,
    osiemnascie: 18,
    dziewietnascie: 19,
    dwadziescia: 20,
    "dwadziescia jeden": 21,
    "dwadziescia dwa": 22,
    "dwadziescia trzy": 23,
    "dwadziescia cztery": 24,
    "dwadziescia piec": 25,
    "dwadziescia szesc": 26,
    "dwadziescia siedem": 27,
    "dwadziescia osiem": 28,
    "dwadziescia dziewiec": 29,
    trzydziesci: 30,
};

function parsePolishNumber(text: string): number {
    const lower = text.toLowerCase();
    if (POLISH_NUMBERS[lower] !== undefined) {
        return POLISH_NUMBERS[lower];
    }
    const parsed = parseInt(text, 10);
    return isNaN(parsed) ? 1 : parsed;
}

function parsePolishDays(text: string): number {
    const lower = text.toLowerCase();
    if (POLISH_DAYS[lower] !== undefined) {
        return POLISH_DAYS[lower];
    }
    const parsed = parseInt(text, 10);
    return isNaN(parsed) ? 1 : parsed;
}

function generateContractId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export default function initContracts(client: Client, aliases: { pattern: RegExp; callback: Function }[]) {
    let contracts: Contract[] = [];
    let pendingContract: Partial<Contract> | null = null;

    const loadContracts = (): void => {
        const stored = getItemSync(STORAGE_KEY);
        if (stored?.[STORAGE_KEY]) {
            const snapshot = stored[STORAGE_KEY] as ContractsSnapshot;
            contracts = snapshot.contracts || [];
        }
    };

    const saveContracts = (): void => {
        const snapshot: ContractsSnapshot = {
            contracts,
            lastCleanup: Date.now(),
        };
        setItemSync(STORAGE_KEY, snapshot);
        eventBus.emit("contracts.updated", { contracts: [...contracts] });
    };

    const cleanupExpiredContracts = (): void => {
        const now = Date.now();
        const before = contracts.length;
        contracts = contracts.filter(c => c.deadlineTimestamp >= now);
        if (contracts.length !== before) {
            saveContracts();
        }
    };

    const addContract = (contract: Contract): void => {
        const existingIdx = contracts.findIndex(
            c => c.locationId === contract.locationId &&
                 c.type === contract.type &&
                 c.item === contract.item
        );
        if (existingIdx >= 0) {
            contracts[existingIdx] = contract;
        } else {
            contracts.push(contract);
        }
        saveContracts();
    };

    const removeContract = (id: string): void => {
        contracts = contracts.filter(c => c.id !== id);
        saveContracts();
    };

    const removeContractsByLocation = (locationId: number): void => {
        const before = contracts.length;
        contracts = contracts.filter(c => c.locationId !== locationId);
        if (contracts.length !== before) {
            saveContracts();
        }
    };

    loadContracts();
    cleanupExpiredContracts();

    // Pattern for contract offer line
    // "Tak, mam pewne pilne zamowienie na zbroje. Potrzebuje czterech tarcz, przynajmniej sredniej jakosci."
    // "Potrzebuje dwudziestu dwoch sztuk plucnicy." - two-word numbers
    const contractOfferPattern = /\w+ do ciebie: Tak, mam pewne pilne zamowienie na ([^.]+)\. Potrzebuje ([a-z]+(?: [a-z]+)?) (?:sztuk )?([^,]+?)(?:, przynajmniej ([^.]+) jakosci)?\..*Dobrze zaplace/;

    // Pattern for deadline line
    // "Na realizacje zamowienia mam siedemnascie dni, pozniej zapewne bede potrzebowac czego innego."
    const deadlinePattern = /\w+ do ciebie: Na realizacje zamowienia mam ([a-z ]+) (?:dni|dzien), pozniej zapewne bede potrzebowac czego innego\./;

    // Pattern for asking about contract
    // "Pytasz blekitnookiego krotkowlosego mezczyzne o zlecenie."
    const askPattern = /^Pytasz .+ o zlecenie\.$/;

    client.Triggers.registerTrigger(askPattern, (line) => {
        const locationId = client.Map.currentRoom?.id ?? null;
        const location = client.Map.currentRoom?.name || "Nieznana lokacja";
        pendingContract = {
            locationId,
            location,
        };
        return line;
    }, 'contracts');

    client.Triggers.registerTrigger(contractOfferPattern, (line, matches) => {
        if (matches && pendingContract) {
            pendingContract.type = matches[1];
            pendingContract.count = parsePolishNumber(matches[2]);
            pendingContract.item = matches[3].trim();
            pendingContract.quality = matches[4] || undefined;
        }
        return line;
    }, 'contracts');

    client.Triggers.registerTrigger(deadlinePattern, (line, matches) => {
        if (matches && pendingContract && pendingContract.type) {
            const daysRemaining = parsePolishDays(matches[1]);
            const deadlineTimestamp = Date.now() + (daysRemaining * ONE_DAY_MS);

            const contract: Contract = {
                id: generateContractId(),
                locationId: pendingContract.locationId ?? null,
                location: pendingContract.location || "Nieznana lokacja",
                type: pendingContract.type,
                item: pendingContract.item || "",
                count: pendingContract.count || 1,
                quality: pendingContract.quality,
                deadlineTimestamp,
                createdAt: Date.now(),
            };

            addContract(contract);
            pendingContract = null;
        }
        return line;
    }, 'contracts');

    // Pattern for no contract available
    // "Nie, w tej chwili niczego mi nie trzeba. Zajrzyj moze za jakis czas."
    const noContractPattern = /\w+ do ciebie: Nie, w tej chwili niczego mi nie trzeba\. Zajrzyj moze za jakis czas\./;

    client.Triggers.registerTrigger(noContractPattern, (line) => {
        if (pendingContract && pendingContract.locationId !== null) {
            removeContractsByLocation(pendingContract.locationId);
        }
        pendingContract = null;
        return line;
    }, 'contracts');

    aliases.push({
        pattern: /^\/zlecenia$/,
        callback: () => {
            cleanupExpiredContracts();
            eventBus.emit("contracts.popup.open", {
                contracts: [...contracts],
                currentLocationId: client.Map.currentRoom?.id ?? null,
            });
        },
    });

    eventBus.on("contracts.remove", (payload: { id: string }) => {
        if (payload?.id) {
            removeContract(payload.id);
        }
    });

    return {
        getContracts: () => [...contracts],
        removeContract,
        cleanupExpiredContracts,
    };
}
