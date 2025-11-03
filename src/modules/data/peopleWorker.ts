/// <reference lib="webworker" />
import type { PersonEntry } from './types/people';
import { parsePeopleDatabase } from './peopleParser';
import { downloadPeopleDatabase } from './peopleDownload';

interface LoadRequest {
    id: number;
    type: 'loadPeople';
}

type WorkerRequest = LoadRequest;

type WorkerResponse =
    | { id: number; status: 'success'; people: PersonEntry[] }
    | { id: number; status: 'error'; error: string };

async function handleLoadPeople(id: number): Promise<WorkerResponse> {
    const buffer = await downloadPeopleDatabase();
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
