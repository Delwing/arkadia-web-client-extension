import { EventEmitter } from 'events';

/** Module shape for `vi.mock('@modules/core/storage', ...)`: get/set are spies. */
export function storageMockModule() {
  const listeners = new Map<string, Set<Function>>();
  const typedStorage = {
    get: jest.fn(),
    set: jest.fn(),
    onChange: jest.fn((key: string, listener: Function) => {
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key)!.add(listener);
      return () => listeners.get(key)!.delete(listener);
    }),
    fireListeners: jest.fn(),
    handleStorageEvent: jest.fn(),
    getCharacter: jest.fn(() => null),
    setCharacter: jest.fn(),
  };
  return {
    __esModule: true,
    characterStorage: typedStorage,
    globalStorage: typedStorage,
  };
}

export class MockClient {
  private emitter = new EventEmitter();
  ObjectManager = { getObjectsOnLocation: () => [] as any[] };
  TeamManager = { isInTeam: (_d: string) => false, getEnemyQueue: () => [] as number[], isLeader: () => false };
  on(event: string, handler: (...args: any[]) => void) {
    this.emitter.on(event, handler);
    return () => this.off(event, handler);
  }
  off(event: string, handler: (...args: any[]) => void) {
    this.emitter.off(event, handler);
  }
  emit(event: string, payload?: any) {
    this.emitter.emit(event, payload);
  }
  dispatch(event: string, payload: any) {
    this.emit(event, payload);
  }
  sendCommand = jest.fn();
  sendEvent = jest.fn();
}

/** A stand-in for the Document Picture-in-Picture window, installed globally. */
export function installPipWindow() {
  const pipDoc = document.implementation.createHTMLDocument('pip');
  const handlers: Record<string, (ev?: any) => void> = {};
  const pipWindow = {
    document: pipDoc,
    addEventListener: jest.fn((type: string, handler: (ev?: any) => void) => {
      handlers[type] = handler;
    }),
    removeEventListener: jest.fn((type: string) => {
      delete handlers[type];
    }),
    close: jest.fn(),
  } as unknown as DocumentPictureInPictureWindow;
  const requestWindow = jest.fn().mockResolvedValue(pipWindow);
  (globalThis as any).documentPictureInPicture = { requestWindow };
  return { pipDoc, pipWindow, handlers, requestWindow };
}

export function uninstallPipWindow() {
  delete (globalThis as any).documentPictureInPicture;
}
