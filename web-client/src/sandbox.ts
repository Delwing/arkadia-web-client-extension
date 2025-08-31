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
    const leaderInput = document.getElementById('sandbox-leader-name') as HTMLInputElement | null;
    const setLeaderButton = document.getElementById('sandbox-set-leader') as HTMLButtonElement | null;

    let id = 1;
    function sendTeam(name: string, leader: boolean) {
        const obj: any = {};
        obj[id++] = { desc: name, team: true, team_leader: leader };
        client.sendEvent('gmcp.objects.data', obj);
    }

    addMemberButton?.addEventListener('click', () => {
        const name = memberInput?.value.trim();
        if (name) {
            sendTeam(name, false);
            memberInput!.value = '';
        }
    });

    setLeaderButton?.addEventListener('click', () => {
        const name = leaderInput?.value.trim();
        if (name) {
            sendTeam(name, true);
            leaderInput!.value = '';
        }
    });
});
