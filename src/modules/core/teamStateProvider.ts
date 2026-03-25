interface TeamState {
    isInAnyTeam: boolean;
    isLeader: boolean;
}

type TeamStateLookup = () => TeamState;

let provider: TeamStateLookup | null = null;

export function registerTeamStateProvider(fn: TeamStateLookup): void {
    provider = fn;
}

export function getTeamState(): TeamState {
    return provider?.() ?? { isInAnyTeam: false, isLeader: false };
}
