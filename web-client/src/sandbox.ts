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
    const members = new Map<string, number>();
    let leader: string | undefined;

    function sendTeam(name: string, leaderFlag: boolean) {
        let memberId = members.get(name);
        if (!memberId) {
            memberId = id++;
            members.set(name, memberId);
        }
        const obj: any = {};
        obj[memberId] = { desc: name, team: true, team_leader: leaderFlag };
        client.sendEvent('gmcp.objects.data', obj);
    }

    function renderTeam() {
        if (!preview) return;
        preview.innerHTML = '';
        members.forEach((_id, name) => {
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
        if (members.has(name)) return;
        sendTeam(name, false);
        renderTeam();
    }

    function setLeader(name: string) {
        if (!members.has(name)) {
            addMember(name);
        }
        if (leader && leader !== name) {
            sendTeam(leader, false);
        }
        leader = name;
        sendTeam(name, true);
        renderTeam();
    }

    function removeMember(name: string) {
        if (!members.has(name)) return;
        client.TeamManager?.removeMember?.(name);
        members.delete(name);
        if (leader === name) {
            leader = undefined;
        }
        renderTeam();
    }

    addMemberButton?.addEventListener('click', () => {
        const name = memberInput?.value.trim();
        if (name) {
            addMember(name);
            memberInput!.value = '';
        }
    });

});
