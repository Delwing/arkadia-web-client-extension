// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { allChannelsOn } from "@ui/logViewer/model/channels";
import { toSearchText, type SearchText } from "@ui/logViewer/model/searchText";
import type { LogLine, LogSessionInfo } from "@ui/logViewer/model/types";
import { resetCrossSearchCache, useCrossSearch, type CrossSearch } from "@ui/logViewer/useCrossSearch";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function info(id: string, startedAt: number, lineCount: number): LogSessionInfo {
    return {
        id,
        characters: [],
        dayLabel: "",
        dateLabel: "",
        startedAt,
        endedAt: startedAt + 1,
        live: false,
        file: `${id}.txt`,
        lineCount,
    };
}

function lines(...texts: string[]): LogLine[] {
    return texts.map((text, index) => ({ number: index + 1, timestamp: index, channel: "room", text }));
}

const texts: Record<string, LogLine[]> = {
    a: lines("troll idzie", "trolla nie ma"),
    b: lines("ork idzie"),
    c: lines("nic"),
};
const sessions = [info("a", 3000, 2), info("b", 2000, 1), info("c", 1000, 1)];
const channels = allChannelsOn();

describe("useCrossSearch", () => {
    let container: HTMLDivElement;
    let root: Root;
    let result: CrossSearch | null;
    let loadSearchText: ReturnType<typeof vi.fn<(id: string) => Promise<SearchText | null>>>;

    function Probe({ query, list = sessions }: { query: string; list?: LogSessionInfo[] }) {
        result = useCrossSearch({
            sessions: list,
            loadSearchText,
            enabled: true,
            query,
            regex: false,
            caseSensitive: false,
            channels,
        });
        return null;
    }

    async function search(query: string, list?: LogSessionInfo[]): Promise<void> {
        await act(async () => root.render(<Probe query={query} list={list} />));
        await act(async () => {
            await vi.runAllTimersAsync();
        });
    }

    beforeEach(() => {
        vi.useFakeTimers();
        resetCrossSearchCache();
        loadSearchText = vi.fn(async (id: string) => toSearchText(texts[id]));
        container = document.createElement("div");
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        vi.useRealTimers();
    });

    it("counts hits in every log", async () => {
        await search("troll");
        expect(result?.hitsBySession).toEqual({ a: 2, b: 0, c: 0 });
        expect(result?.running).toBe(false);
        expect(loadSearchText).toHaveBeenCalledTimes(3);
    });

    it("reads only the logs an extended query can still match", async () => {
        await search("tro");
        loadSearchText.mockClear();
        await search("trolla");
        expect(loadSearchText.mock.calls.map(([id]) => id)).toEqual(["a"]);
        expect(result?.hitsBySession).toEqual({ a: 1, b: 0, c: 0 });
    });

    it("answers a search it has run before without reading a log", async () => {
        await search("troll");
        await search("ork");
        loadSearchText.mockClear();
        await search("troll");
        expect(loadSearchText).not.toHaveBeenCalled();
        expect(result?.hitsBySession).toEqual({ a: 2, b: 0, c: 0 });
    });

    it("reads a log again once it has grown", async () => {
        await search("troll");
        loadSearchText.mockClear();
        await search("troll", [info("a", 3000, 2), info("b", 2000, 2), info("c", 1000, 1)]);
        expect(loadSearchText.mock.calls.map(([id]) => id)).toEqual(["b"]);
    });

    it("does not narrow a regular expression", async () => {
        await search("tro");
        loadSearchText.mockClear();
        function RegexProbe() {
            result = useCrossSearch({ sessions, loadSearchText, enabled: true, query: "tro.*", regex: true, caseSensitive: false, channels });
            return null;
        }
        await act(async () => root.render(<RegexProbe />));
        await act(async () => {
            await vi.runAllTimersAsync();
        });
        expect(loadSearchText).toHaveBeenCalledTimes(3);
    });
});
