import { buildDocumentBlocks, MAX_DOCUMENT_LINES, pushLine } from "@web-ui/bossKey/documentLog";

// The boss key overlay shows the real transcript as the body of a fake Word
// document. Readability wins over prose here: the game leans on line structure
// for combat, listings and tells, so lines stay lines.
describe("buildDocumentBlocks", () => {
  it("keeps one document line per output line", () => {
    const blocks = buildDocumentBlocks([
      { text: "Stoisz na polanie." },
      { text: "Dokola rosna wysokie drzewa." },
    ]);

    expect(blocks).toEqual([
      { kind: "line", text: "Stoisz na polanie." },
      { kind: "line", text: "Dokola rosna wysokie drzewa." },
    ]);
  });

  it("preserves leading whitespace so listings stay aligned", () => {
    const blocks = buildDocumentBlocks([{ text: "    miecz dlugi        1" }]);

    expect(blocks[0].text).toBe("    miecz dlugi        1");
  });

  it("keeps blank lines, which the game uses to separate blocks", () => {
    const blocks = buildDocumentBlocks([
      { text: "Pierwszy blok." },
      { text: "" },
      { text: "Drugi blok." },
    ]);

    expect(blocks.map((block) => block.kind)).toEqual(["line", "blank", "line"]);
  });

  it("does not open the page on blank space", () => {
    // The head of the rolling buffer is an arbitrary cut, not a real gap.
    const blocks = buildDocumentBlocks([{ text: "" }, { text: "   " }, { text: "Tekst." }]);

    expect(blocks).toEqual([{ kind: "line", text: "Tekst." }]);
  });

  it("renders room.short as a heading", () => {
    const blocks = buildDocumentBlocks([
      { text: "Idziesz na polnoc." },
      { text: "Waska sciezka", type: "room.short" },
      { text: "Sciezka wiedzie dalej." },
    ]);

    expect(blocks).toEqual([
      { kind: "line", text: "Idziesz na polnoc." },
      { kind: "heading", text: "Waska sciezka" },
      { kind: "line", text: "Sciezka wiedzie dalej." },
    ]);
  });

  it("drops an empty room.short instead of emitting a blank heading", () => {
    const blocks = buildDocumentBlocks([{ text: "   ", type: "room.short" }, { text: "Tekst." }]);

    expect(blocks).toEqual([{ kind: "line", text: "Tekst." }]);
  });

  it("returns nothing for an empty transcript, so the fallback page shows", () => {
    expect(buildDocumentBlocks([])).toEqual([]);
    expect(buildDocumentBlocks([{ text: "" }, { text: "  " }])).toEqual([]);
  });
});

describe("pushLine", () => {
  it("caps the buffer and keeps the newest lines", () => {
    const buffer: Array<{ text: string }> = [];
    for (let i = 0; i < MAX_DOCUMENT_LINES + 50; i += 1) {
      pushLine(buffer, { text: `line ${i}` });
    }

    expect(buffer).toHaveLength(MAX_DOCUMENT_LINES);
    expect(buffer[buffer.length - 1].text).toBe(`line ${MAX_DOCUMENT_LINES + 49}`);
    expect(buffer[0].text).toBe("line 50");
  });
});
