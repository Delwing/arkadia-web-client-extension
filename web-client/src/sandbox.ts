import 'bootswatch/dist/darkly/bootstrap.min.css';
import './style.css';
import ArkadiaClient from './ArkadiaClient.ts';
import Client from '@client/src/Client.ts';
import MockPort from './MockPort.ts';

const client = new Client(ArkadiaClient, new MockPort());
(window as any).clientExtension = client;
(window as any).client = ArkadiaClient;

const teamList = document.getElementById('team-members') as HTMLElement | null;
const renderTeam = () => {
  if (teamList) {
    teamList.textContent = client.TeamManager.getTeamMembers().join('\n');
  }
};
client.addEventListener('teamChange', renderTeam);

document.getElementById('add-member')?.addEventListener('click', () => {
  const name = window.prompt('Member name?');
  if (name) {
    (client.TeamManager as any).addMember(name);
  }
});

document.getElementById('clear-team')?.addEventListener('click', () => {
  (client.TeamManager as any).clearTeam();
});
