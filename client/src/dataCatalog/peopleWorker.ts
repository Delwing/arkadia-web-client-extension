/// <reference lib="webworker" />

import { parsePeopleDatabase } from './peopleParser';
import { downloadPeopleDatabase } from './peopleDownload';
import { PeopleCollection } from './entities';

interface WorkerRequest {
    type: 'load';
}

interface WorkerSuccessResponse<T> {
    type: 'success';
    payload: T;
}

interface WorkerErrorResponse {
    type: 'error';
    message: string;
}

type WorkerResponse<T> = WorkerSuccessResponse<T> | WorkerErrorResponse;

const getPeople = async (): Promise<PeopleCollection> => {

    const buffer = await downloadPeopleDatabase();
    return parsePeopleDatabase(buffer);
};

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
    const message = event.data;
    if (message?.type !== 'load') {
        return;
    }

    try {
        const people = await getPeople();
        const response: WorkerResponse<PeopleCollection> = { type: 'success', payload: people };
        ctx.postMessage(response);
    } catch (error) {
        const response: WorkerErrorResponse = {
            type: 'error',
            message: error instanceof Error ? error.message : 'Unknown worker error',
        };
        ctx.postMessage(response);
    }
});

export {};

