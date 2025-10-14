export function createPeopleWorker(): Worker {
  return new Worker(new URL('./peopleWorker.ts', import.meta.url), { type: 'module' });
}
