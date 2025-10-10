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
    const toggleFightButton = document.getElementById('sandbox-toggle-fight') as HTMLButtonElement | null;
    const preview = document.getElementById('sandbox-team-preview');

    let id = 1;
    const ids = new Map<string, number>();
    const objectNums = new Set<number>();
    const teamIds = new Set<number>();
    const enemyIds = new Set<number>();
    const hps = new Map<number, number>();
    let fightActive = false;

    function updateFightButton() {
        if (!toggleFightButton) return;
        toggleFightButton.textContent = fightActive ? 'Stop Fight' : 'Start Fight';
    }

    function sendTeam(name: string, leaderFlag: boolean) {
        let memberId = ids.get(name);
        if (!memberId) {
            memberId = id++;
            ids.set(name, memberId);
        }
        teamIds.add(memberId);
        enemyIds.delete(memberId);

        let hp = hps.get(memberId);
        if (hp === undefined) {
            hp = Math.floor(Math.random() * 7);
            hps.set(memberId, hp);
        }
        const obj: any = {};
        obj[memberId] = { desc: name, team: true, team_leader: leaderFlag, state: hp, hp };
        objectNums.add(memberId);
        client.sendEvent('gmcp.objects.data', obj);
        client.sendEvent('gmcp.objects.nums', Array.from(objectNums));
    }

    function getRandomEntry(idsArray: number[]) {
        if (!idsArray.length) {
            return false;
        }
        const index = Math.floor(Math.random() * idsArray.length);
        return idsArray[index];
    }

    function assignRandomAttackTargets() {
        if (!objectNums.size) return;

        const activeTeamIds = Array.from(teamIds).filter((teamId) => objectNums.has(teamId));
        const activeEnemyIds = Array.from(enemyIds).filter((enemyId) => objectNums.has(enemyId));

        if (!activeTeamIds.length && !activeEnemyIds.length) return;

        const activeTeamSet = new Set(activeTeamIds);
        const activeEnemySet = new Set(activeEnemyIds);
        const payload: Record<number, { attack_num: number | false }> = {};

        objectNums.forEach((objId) => {
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
    }

    function clearAttackTargets() {
        if (!objectNums.size) return;

        const payload: Record<number, { attack_num: false }> = {};
        objectNums.forEach((objId) => {
            payload[objId] = { attack_num: false };
        });

        client.sendEvent('gmcp.objects.data', payload);
    }

    function ensureFightAssignments() {
        if (!fightActive) return;
        assignRandomAttackTargets();
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
        ensureFightAssignments();
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
            teamIds.delete(memberId);
            hps.delete(memberId);
            client.sendEvent('gmcp.objects.nums', Array.from(objectNums));
        }
        client.TeamManager?.removeMember?.(name);
        ensureFightAssignments();
    }

    function addEnemy() {
        const names = ['Goblin', 'Orc', 'Troll', 'Bandit', 'Wolf'];
        const base = names[Math.floor(Math.random() * names.length)];
        const enemyName = `${base} ${id}`;
        const enemyId = id++;
        ids.set(enemyName, enemyId);
        objectNums.add(enemyId);
        enemyIds.add(enemyId);
        const hp = Math.floor(Math.random() * 7);
        const obj: any = {};
        obj[enemyId] = { desc: enemyName, state: hp, hp };
        client.sendEvent('gmcp.objects.data', obj);
        client.sendEvent('gmcp.objects.nums', Array.from(objectNums));
        ensureFightAssignments();
    }

    function generateRandomMemberName() {
        const names = ['Arin', 'Bran', 'Cira', 'Doran', 'Elia'];
        const base = names[Math.floor(Math.random() * names.length)];
        let candidate = `${base} ${id}`;
        while (ids.has(candidate)) {
            const nextBase = names[Math.floor(Math.random() * names.length)];
            candidate = `${nextBase} ${id}`;
        }
        return candidate;
    }

    client.addEventListener?.('teamChange', renderTeam);

    const playerName = 'Player';
    client.sendEvent('gmcp.char.info', { name: playerName, object_num: id });
    ids.set(playerName, id++);
    addMember(playerName);

    addMemberButton?.addEventListener('click', () => {
        let name = memberInput?.value.trim() || '';
        if (!name) {
            name = generateRandomMemberName();
        }
        addMember(name);
        if (memberInput) {
            memberInput.value = '';
        }
    });

    addEnemyButton?.addEventListener('click', () => {
        addEnemy();
    });

    toggleFightButton?.addEventListener('click', () => {
        if (fightActive) {
            clearAttackTargets();
            fightActive = false;
        } else {
            assignRandomAttackTargets();
            fightActive = true;
        }
        updateFightButton();
    });

    updateFightButton();

});
