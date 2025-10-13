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

const simulateExpensivePeopleLoad = async (): Promise<PeopleCollection> => {
  await new Promise((resolve) => setTimeout(resolve, 150));

  return [
    {
      id: 'player-1',
      name: 'Ari the Brave',
      health: 98,
      inventory: ['bronze sword', 'healing potion'],
    },
    {
      id: 'player-2',
      name: 'Mira the Swift',
      health: 76,
      inventory: ['bow', 'silver key', 'mana herb'],
    },
    {
      id: 'player-3',
      name: 'Therin the Wise',
      health: 54,
      inventory: ['spellbook', 'ancient rune'],
    },
  ];
};

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message?.type !== 'load') {
    return;
  }

  try {
    const people = await simulateExpensivePeopleLoad();
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
