import React, {useCallback, useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './sandbox.css';
import arkadiaClient from "./ArkadiaClient.ts";
import indexTemplate from "../index.html?raw";

// Disable real network and echo commands locally
arkadiaClient.connect = () => {
    console.log('Sandbox mode: connection disabled');
};
arkadiaClient.sendGmcp = () => {};
arkadiaClient.send = (message: string, echo: boolean = true) => {
    arkadiaClient.recorder?.handleOutgoing?.(message);
    if ((arkadiaClient as any).receivedFirstGmcp && message) {
        const formatted = `→ ${message}`;
        if (echo) {
            arkadiaClient.output(formatted, 'command');
        } else {
            arkadiaClient.output(`<i>${formatted}</i>`, 'command');
        }
    }
};
(arkadiaClient as any).receivedFirstGmcp = true;

const namesPool = ['Arin', 'Bran', 'Cira', 'Doran', 'Elia'];
const enemyPool = ['Goblin', 'Orc', 'Troll', 'Bandit', 'Wolf'];

const SandboxApp: React.FC = () => {
    const appContainerRef = useRef<HTMLDivElement | null>(null);
    const appendedNodesRef = useRef<Element[]>([]);
    const clientRef = useRef<any>(null);
    const idsRef = useRef<Map<string, number>>(new Map());
    const objectNumsRef = useRef<Set<number>>(new Set());
    const teamIdsRef = useRef<Set<number>>(new Set());
    const enemyIdsRef = useRef<Set<number>>(new Set());
    const hpsRef = useRef<Map<number, number>>(new Map());
    const idCounterRef = useRef<number>(1);

    const [clientReady, setClientReady] = useState(false);
    const [memberName, setMemberName] = useState('');
    const [fightActive, setFightActive] = useState(false);
    const [teamMembers, setTeamMembers] = useState<string[]>([]);
    const [leader, setLeaderState] = useState<string | null>(null);

    const ensureTeamState = useCallback(() => {
        const client = clientRef.current;
        if (!client) return;
        const members: string[] = client.TeamManager?.getTeamMembers?.() ?? [];
        setTeamMembers([...members]);
        const leaderName: string | null = client.TeamManager?.getLeader?.() ?? null;
        setLeaderState(leaderName);
    }, []);

    const getRandomEntry = useCallback((idsArray: number[]) => {
        if (!idsArray.length) {
            return false;
        }
        const index = Math.floor(Math.random() * idsArray.length);
        return idsArray[index];
    }, []);

    const assignRandomAttackTargets = useCallback(() => {
        const client = clientRef.current;
        if (!client) return;
        if (!objectNumsRef.current.size) return;

        const activeTeamIds = Array.from(teamIdsRef.current).filter((teamId) => objectNumsRef.current.has(teamId));
        const activeEnemyIds = Array.from(enemyIdsRef.current).filter((enemyId) => objectNumsRef.current.has(enemyId));

        if (!activeTeamIds.length && !activeEnemyIds.length) return;

        const activeTeamSet = new Set(activeTeamIds);
        const activeEnemySet = new Set(activeEnemyIds);
        const payload: Record<number, { attack_num: number | false }> = {};

        objectNumsRef.current.forEach((objId) => {
            if (activeTeamSet.has(objId)) {
                payload[objId] = {
                    attack_num: getRandomEntry(activeEnemyIds),
                };
            } else if (activeEnemySet.has(objId)) {
                payload[objId] = {
                    attack_num: getRandomEntry(activeTeamIds),
                };
            } else {
                payload[objId] = { attack_num: false };
            }
        });

        client.sendEvent('gmcp.objects.data', payload);
    }, [getRandomEntry]);

    const clearAttackTargets = useCallback(() => {
        const client = clientRef.current;
        if (!client) return;
        if (!objectNumsRef.current.size) return;

        const payload: Record<number, { attack_num: false }> = {};
        objectNumsRef.current.forEach((objId) => {
            payload[objId] = { attack_num: false };
        });

        client.sendEvent('gmcp.objects.data', payload);
    }, []);

    const ensureFightAssignments = useCallback(() => {
        if (!fightActive) return;
        assignRandomAttackTargets();
    }, [assignRandomAttackTargets, fightActive]);

    const sendTeam = useCallback((name: string, leaderFlag: boolean) => {
        const client = clientRef.current;
        if (!client) return;

        let memberId = idsRef.current.get(name);
        if (!memberId) {
            memberId = idCounterRef.current++;
            idsRef.current.set(name, memberId);
        }
        teamIdsRef.current.add(memberId);
        enemyIdsRef.current.delete(memberId);

        let hp = hpsRef.current.get(memberId);
        if (hp === undefined) {
            hp = Math.floor(Math.random() * 7);
            hpsRef.current.set(memberId, hp);
        }
        const obj: Record<number, any> = {};
        obj[memberId] = { desc: name, team: true, team_leader: leaderFlag, state: hp, hp };
        objectNumsRef.current.add(memberId);
        client.sendEvent('gmcp.objects.data', obj);
        client.sendEvent('gmcp.objects.nums', Array.from(objectNumsRef.current));
    }, []);

    const addMemberByName = useCallback((name: string) => {
        sendTeam(name, false);
        ensureFightAssignments();
        ensureTeamState();
    }, [ensureFightAssignments, ensureTeamState, sendTeam]);

    const setLeader = useCallback((name: string) => {
        const client = clientRef.current;
        if (!client) return;
        const currentLeader = client.TeamManager?.getLeader?.();
        if (currentLeader && currentLeader !== name) {
            sendTeam(currentLeader, false);
        }
        sendTeam(name, true);
        ensureTeamState();
    }, [ensureTeamState, sendTeam]);

    const removeMember = useCallback((name: string) => {
        const client = clientRef.current;
        if (!client) return;
        const memberId = idsRef.current.get(name);
        if (memberId) {
            objectNumsRef.current.delete(memberId);
            teamIdsRef.current.delete(memberId);
            hpsRef.current.delete(memberId);
            client.sendEvent('gmcp.objects.nums', Array.from(objectNumsRef.current));
        }
        client.TeamManager?.removeMember?.(name);
        ensureFightAssignments();
        ensureTeamState();
    }, [ensureFightAssignments, ensureTeamState]);

    const addEnemy = useCallback(() => {
        const client = clientRef.current;
        if (!client) return;
        const base = enemyPool[Math.floor(Math.random() * enemyPool.length)];
        const enemyName = `${base} ${idCounterRef.current}`;
        const enemyId = idCounterRef.current++;
        idsRef.current.set(enemyName, enemyId);
        objectNumsRef.current.add(enemyId);
        enemyIdsRef.current.add(enemyId);
        const hp = Math.floor(Math.random() * 7);
        const obj: Record<number, any> = {};
        obj[enemyId] = { desc: enemyName, state: hp, hp };
        client.sendEvent('gmcp.objects.data', obj);
        client.sendEvent('gmcp.objects.nums', Array.from(objectNumsRef.current));
        ensureFightAssignments();
    }, [ensureFightAssignments]);

    const generateRandomMemberName = useCallback(() => {
        let candidate = `${namesPool[Math.floor(Math.random() * namesPool.length)]} ${idCounterRef.current}`;
        while (idsRef.current.has(candidate)) {
            candidate = `${namesPool[Math.floor(Math.random() * namesPool.length)]} ${idCounterRef.current}`;
        }
        return candidate;
    }, []);

    useEffect(() => {
        const container = appContainerRef.current;
        if (!container) return;

        const parser = new DOMParser();
        const doc = parser.parseFromString(indexTemplate, 'text/html');
        appendedNodesRef.current.forEach((node) => node.remove());
        appendedNodesRef.current = [];

        Array.from(doc.body.attributes).forEach((attr) => {
            document.body.setAttribute(attr.name, attr.value);
        });

        Array.from(doc.body.children).forEach((child) => {
            if (child.tagName?.toLowerCase() === 'script') {
                return;
            }
            const clone = child.cloneNode(true) as Element;
            if (clone.id === 'context-menu') {
                document.body.appendChild(clone);
            } else {
                container.appendChild(clone);
            }
            appendedNodesRef.current.push(clone);
        });

        let cancelled = false;

        const loadModules = async () => {
            try {
                await import('./plugin.ts');
                await import('./main.ts');
                await import('./docs.ts');
                await import('./debug.ts');
                await import('./logBrowser.ts');
            } catch (error) {
                console.error('Failed to initialize sandbox', error);
                return;
            }
            if (cancelled) return;
            const client = (window as any).clientExtension;
            if (!client) return;
            clientRef.current = client;
            arkadiaClient.emit('client.connect');
            const playerName = 'Player';
            client.sendEvent('gmcp.char.info', { name: playerName, object_num: idCounterRef.current });
            idsRef.current.set(playerName, idCounterRef.current++);
            sendTeam(playerName, false);
            ensureTeamState();
            setClientReady(true);
        };

        loadModules();

        return () => {
            cancelled = true;
            appendedNodesRef.current.forEach((node) => node.remove());
            appendedNodesRef.current = [];
        };
    }, [ensureTeamState, sendTeam]);

    useEffect(() => {
        if (!clientReady) return;
        const client = clientRef.current;
        if (!client?.addEventListener) return;
        const handler = () => ensureTeamState();
        client.addEventListener('teamChange', handler);
        ensureTeamState();
        return () => {
            client.removeEventListener?.('teamChange', handler);
        };
    }, [clientReady, ensureTeamState]);

    const handleAddMember = () => {
        if (!clientReady) return;
        let name = memberName.trim();
        if (!name) {
            name = generateRandomMemberName();
        }
        addMemberByName(name);
        setMemberName('');
    };

    const handleToggleFight = () => {
        if (!clientReady) return;
        if (fightActive) {
            clearAttackTargets();
            setFightActive(false);
        } else {
            assignRandomAttackTargets();
            setFightActive(true);
        }
    };

    return (
        <div id="sandbox-layout" className="sandbox-layout">
            <div className="sandbox-content" ref={appContainerRef} />
            <div id="sandbox-panel" className="sandbox-panel">
                <h5>Sandbox</h5>
                <div className="mb-2">
                    <input
                        value={memberName}
                        onChange={(event) => setMemberName(event.target.value)}
                        className="form-control"
                        placeholder="Team member"
                        disabled={!clientReady}
                    />
                    <button
                        id="sandbox-add-member"
                        className="btn btn-secondary btn-sm w-100 mt-1"
                        onClick={handleAddMember}
                        disabled={!clientReady}
                    >
                        Add Member
                    </button>
                </div>
                <div className="mb-2">
                    <button
                        id="sandbox-add-enemy"
                        className="btn btn-secondary btn-sm w-100"
                        onClick={addEnemy}
                        disabled={!clientReady}
                    >
                        Add Enemy
                    </button>
                </div>
                <div className="mb-2">
                    <button
                        id="sandbox-toggle-fight"
                        className="btn btn-secondary btn-sm w-100"
                        onClick={handleToggleFight}
                        disabled={!clientReady}
                    >
                        {fightActive ? 'Stop Fight' : 'Start Fight'}
                    </button>
                </div>
                <ul id="sandbox-team-preview" className="sandbox-team-preview list-unstyled">
                    {teamMembers.map((name) => (
                        <li
                            key={name}
                            className="sandbox-team-member"
                            onClick={() => clientReady && setLeader(name)}
                        >
                            <span>
                                {leader === name && <span className="leader-indicator">★</span>}
                                {name}
                            </span>
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    removeMember(name);
                                }}
                                aria-label={`Remove ${name}`}
                                disabled={!clientReady}
                            >
                                ×
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

const rootElement = document.getElementById('sandbox-root');
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<SandboxApp />);
}
