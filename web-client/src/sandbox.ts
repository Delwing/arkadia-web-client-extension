import './sandbox.css';
import arkadiaClient from "./ArkadiaClient.ts";

// Disable connection to the remote server in sandbox mode
arkadiaClient.connect = () => {
    console.log('Sandbox mode: connection disabled');
};
arkadiaClient.send = () => {};
arkadiaClient.sendGmcp = () => {};

window.addEventListener('load', () => {
    const client: any = (window as any).clientExtension;
    const memberInput = document.getElementById('sandbox-member-name') as HTMLInputElement | null;
    const addMemberButton = document.getElementById('sandbox-add-member') as HTMLButtonElement | null;
    const preview = document.getElementById('sandbox-team-preview');

    let id = 1;
    const ids = new Map<string, number>();

    function sendTeam(name: string, leaderFlag: boolean) {
        let memberId = ids.get(name);
        if (!memberId) {
            memberId = id++;
            ids.set(name, memberId);
        }
        const obj: any = {};
        obj[memberId] = { desc: name, team: true, team_leader: leaderFlag };
        client.sendEvent('gmcp.objects.data', obj);
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
        client.TeamManager?.removeMember?.(name);
    }

    client.addEventListener?.('teamChange', renderTeam);

    const playerName = 'Player';
    client.sendEvent('gmcp.char.info', { name: playerName, object_num: id });
    ids.set(playerName, id++);
    addMember(playerName);

    addMemberButton?.addEventListener('click', () => {
        const name = memberInput?.value.trim();
        if (name) {
            addMember(name);
            memberInput!.value = '';
        }
    });

});
