import { runtimeEventHub } from "@client/src/runtime/event-hub";
import type { RuntimeEvents } from "@client/src/runtime/event-hub";
import './sandbox.css';
import arkadiaClient from "./ArkadiaClient.ts";

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

window.addEventListener('load', () => {
    const client: any = (window as any).clientExtension;
    arkadiaClient.emit('client.connect');
    const memberInput = document.getElementById('sandbox-member-name') as HTMLInputElement | null;
    const addMemberButton = document.getElementById('sandbox-add-member') as HTMLButtonElement | null;
    const addEnemyButton = document.getElementById('sandbox-add-enemy') as HTMLButtonElement | null;
    const preview = document.getElementById('sandbox-team-preview');

    let id = 1;
    const ids = new Map<string, number>();
    const objectNums = new Set<number>();
    const hps = new Map<number, number>();

    function emitGmcp(path: string, value: unknown) {
        client?.sendEvent?.(`gmcp.${path}`, value);
        runtimeEventHub.emit(`gmcp.${path}` as keyof RuntimeEvents, value as never);
        runtimeEventHub.emit('gmcp', { path, value } as RuntimeEvents['gmcp']);
    }

    function sendTeam(name: string, leaderFlag: boolean) {
        let memberId = ids.get(name);
        if (!memberId) {
            memberId = id++;
            ids.set(name, memberId);
        }
        let hp = hps.get(memberId);
        if (hp === undefined) {
            hp = Math.floor(Math.random() * 7);
            hps.set(memberId, hp);
        }
        const obj: any = {};
        obj[memberId] = { desc: name, team: true, team_leader: leaderFlag, state: hp, hp };
        objectNums.add(memberId);
        emitGmcp('objects.data', obj);
        emitGmcp('objects.nums', Array.from(objectNums));
    }

    function renderTeam() {
        if (!preview) return;
        preview.innerHTML = '';
        const members: string[] = client.TeamManager?.getTeamMembers?.() ?? [];
        const leader = client.TeamManager?.getLeader?.();
        members.forEach((name) => {
            const li = document.createElement('li');
            li.className = 'sandbox-team-member';
            li.addEventListener('click', () => setLeader(name));

            const label = document.createElement('span');
            if (leader === name) {
                const indicator = document.createElement('span');
                indicator.textContent = '★';
                indicator.className = 'leader-indicator';
                label.appendChild(indicator);
            }
            label.append(name);
            li.appendChild(label);

            const removeBtn = document.createElement('button');
            removeBtn.textContent = 'x';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeMember(name);
            });
            li.appendChild(removeBtn);

            preview.appendChild(li);
        });
    }

    function addMember(name: string) {
        sendTeam(name, false);
    }

    function setLeader(name: string) {
        const currentLeader = client.TeamManager?.getLeader?.();
        if (currentLeader && currentLeader !== name) {
            sendTeam(currentLeader, false);
        }
        sendTeam(name, true);
    }

    function removeMember(name: string) {
        const memberId = ids.get(name);
        if (memberId) {
            objectNums.delete(memberId);
            hps.delete(memberId);
            const update: Record<number, { team: boolean; team_leader: boolean }> = {};
            update[memberId] = { team: false, team_leader: false };
            emitGmcp('objects.data', update);
            emitGmcp('objects.nums', Array.from(objectNums));
        }
        client.TeamManager?.removeMember?.(name);
    }

    function addEnemy() {
        const names = ['Goblin', 'Orc', 'Troll', 'Bandit', 'Wolf'];
        const base = names[Math.floor(Math.random() * names.length)];
        const enemyName = `${base} ${id}`;
        const enemyId = id++;
        ids.set(enemyName, enemyId);
        objectNums.add(enemyId);
        const hp = Math.floor(Math.random() * 7);
        const obj: any = {};
        obj[enemyId] = { desc: enemyName, state: hp, hp };
        emitGmcp('objects.data', obj);
        emitGmcp('objects.nums', Array.from(objectNums));
    }

    client.addEventListener?.('teamChange', renderTeam);

    const playerName = 'Player';
    const charInfo = { name: playerName, object_num: id };
    emitGmcp('char.info', charInfo);
    ids.set(playerName, id++);
    addMember(playerName);

    addMemberButton?.addEventListener('click', () => {
        const name = memberInput?.value.trim();
        if (name) {
            addMember(name);
            memberInput!.value = '';
        }
    });

    addEnemyButton?.addEventListener('click', () => {
        addEnemy();
    });

});
