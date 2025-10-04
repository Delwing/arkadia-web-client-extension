/// <reference lib="webworker" />
import type { PersonEntry } from './types/people';
import { parsePeopleDatabase } from './peopleParser';

const PEOPLE_DB_URL = 'https://arkadia.kamerdyner.net/master3/Database_people.db';

interface LoadRequest {
    id: number;
    type: 'loadPeople';
}

type WorkerRequest = LoadRequest;

type WorkerResponse =
    | { id: number; status: 'success'; people: PersonEntry[] }
    | { id: number; status: 'error'; error: string };

async function downloadDatabase(): Promise<ArrayBuffer> {
    const response = await fetch(PEOPLE_DB_URL, {
        cache: 'no-cache',
        headers: {
            'Cache-Control': 'no-cache',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to download people database (${response.status})`);
    }

    return await response.arrayBuffer();
}

async function handleLoadPeople(id: number): Promise<WorkerResponse> {
    const buffer = await downloadDatabase();
    const people = await parsePeopleDatabase(buffer);
    return { id, status: 'success', people };
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
    const { data } = event;
    if (!data || data.type !== 'loadPeople') {
        return;
    }

    handleLoadPeople(data.id)
        .then((response) => {
            self.postMessage(response as WorkerResponse);
        })
        .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : 'Unknown error';
            const response: WorkerResponse = { id: data.id, status: 'error', error: message };
            self.postMessage(response);
        });
});

export {};
