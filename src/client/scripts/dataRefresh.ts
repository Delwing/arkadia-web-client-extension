import Client from '../Client';
import {getMagicsStore} from '@modules/data/dataStores/magicsStore';
import {getMagicKeysStore} from '@modules/data/dataStores/magicKeysStore';
import {getKnowledgeStore} from '@modules/data/dataStores/knowledgeStore';
import {getWiedzaStore} from '@modules/data/dataStores/wiedzaStore';
import {getKnowledgeDetailsStore} from '@modules/data/dataStores/knowledgeDetailsStore';

export default function initDataRefresh(client: Client, aliases: { pattern: RegExp; callback: Function }[]) {
    aliases.push({
        pattern: /^\/refresh_magics$/,
        callback: async () => {
            client.println('Odswiezanie danych magii...');
            try {
                await getMagicsStore().refresh({force: true});
                client.println('Dane magii odswiezone.');
            } catch (e) {
                client.println('Blad odswiezania danych magii.');
                console.error('Failed to force refresh magics:', e);
            }
        },
    });

    aliases.push({
        pattern: /^\/refresh_keys$/,
        callback: async () => {
            client.println('Odswiezanie danych kluczy magicznych...');
            try {
                await getMagicKeysStore().refresh({force: true});
                client.println('Dane kluczy magicznych odswiezone.');
            } catch (e) {
                client.println('Blad odswiezania danych kluczy magicznych.');
                console.error('Failed to force refresh magic keys:', e);
            }
        },
    });

    aliases.push({
        pattern: /^\/refresh_knowledge$/,
        callback: async () => {
            client.println('Odswiezanie danych wiedzy...');
            try {
                await Promise.all([
                    getKnowledgeStore().refresh({force: true}),
                    getWiedzaStore().refresh({force: true}),
                    getKnowledgeDetailsStore().refresh({force: true}),
                ]);
                client.println('Dane wiedzy odswiezone.');
            } catch (e) {
                client.println('Blad odswiezania danych wiedzy.');
                console.error('Failed to force refresh knowledge:', e);
            }
        },
    });
}
