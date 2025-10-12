import type { NpcDefinition } from "@client/src/runtime/data";
import { Subject } from "rxjs";

jest.mock("@client/src/runtime/service-registry", () => {
  const { Subject } = jest.requireActual("rxjs");
  let readySubject = new Subject();
  const dataCatalog = {
    readyForNpc$: jest.fn(() => readySubject.asObservable()),
    getNpcData: jest.fn(),
    setNpcData: jest.fn(() => Promise.resolve()),
  };

  return {
    __esModule: true,
    default: {
      dataCatalog,
    },
    __dataCatalogMock: dataCatalog,
    __setReadySubject: (nextSubject: typeof readySubject) => {
      readySubject = nextSubject;
    },
    __getReadySubject: () => readySubject,
  };
});

jest.mock("@client/src/storage", () => {
  const listeners: Array<(changes: Record<string, { newValue: unknown }>) => void> = [];

  return {
    __esModule: true,
    default: {
      onChanged: {
        addListener: (cb: (changes: Record<string, { newValue: unknown }>) => void) => {
          listeners.push(cb);
        },
      },
    },
    setItemSync: jest.fn(),
    getItemSync: jest.fn(() => ({})),
    __storageListeners: listeners,
  };
});

jest.mock("../src/multibindStorage", () => ({
  readMultibinds: jest.fn(() => Promise.resolve([])),
  replaceMultibinds: jest.fn((value: unknown) => Promise.resolve(value)),
}));

import MockPort from "../src/MockPort";

const servicesModule = jest.requireMock("@client/src/runtime/service-registry") as any;
const storageModule = jest.requireMock("@client/src/storage") as any;

function setCatalogData(data: readonly NpcDefinition[]) {
  servicesModule.__dataCatalogMock.getNpcData.mockReturnValue([...data]);
}

describe("MockPort NPC catalog integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    servicesModule.__setReadySubject(new Subject());
    setCatalogData([]);
  });

  test("persists NPC additions through the data catalog", () => {
    setCatalogData([{ name: "Existing", loc: 10 }]);
    const port = new MockPort();

    port.postMessage({ type: "NEW_NPC", name: "New", loc: 20 });

    expect(servicesModule.__dataCatalogMock.setNpcData).toHaveBeenCalledWith(
      [{ name: "Existing", loc: 10 }, { name: "New", loc: 20 }],
      "cache",
    );
  });

  test("ignores duplicate NPC additions", () => {
    setCatalogData([{ name: "Existing", loc: 10 }]);
    const port = new MockPort();

    port.postMessage({ type: "NEW_NPC", name: "Existing", loc: 10 });

    expect(servicesModule.__dataCatalogMock.setNpcData).not.toHaveBeenCalled();
  });

  test("dispatches NPC data when catalog emits readiness", () => {
    const readySubject: Subject<{ data: readonly NpcDefinition[] }> = new Subject();
    servicesModule.__setReadySubject(readySubject);
    setCatalogData([]);
    const port = new MockPort();
    const listener = jest.fn();
    port.onMessage.addListener(listener);

    readySubject.next({ data: [{ name: "Ready", loc: 42 }] });

    expect(listener).toHaveBeenCalledWith({ npc: [{ name: "Ready", loc: 42 }] });
    expect(listener).toHaveBeenCalledWith({ storage: { key: "npc", value: [{ name: "Ready", loc: 42 }] } });
  });

  test("responds to storage requests using catalog data", () => {
    setCatalogData([{ name: "Stored", loc: 5 }]);
    const port = new MockPort();
    const listener = jest.fn();
    port.onMessage.addListener(listener);

    port.postMessage({ type: "GET_STORAGE", key: "npc" });

    expect(listener).toHaveBeenCalledWith({ npc: [{ name: "Stored", loc: 5 }] });
    expect(listener).toHaveBeenCalledWith({ storage: { key: "npc", value: [{ name: "Stored", loc: 5 }] } });
  });

  test("syncs storage changes back into the catalog", () => {
    const port = new MockPort();
    const [listener] = storageModule.__storageListeners as Array<(changes: Record<string, { newValue: unknown }>) => void>;

    listener({ npc: { newValue: [{ name: "Sync", loc: 99 }] } });

    expect(servicesModule.__dataCatalogMock.setNpcData).toHaveBeenCalledWith(
      [{ name: "Sync", loc: 99 }],
      "cache",
    );
  });
});
