import { Marked, type Token, type Tokens } from "marked";
import { foldText } from "@web/settings/settingsSearch.ts";
import type { DocGroup, DocPageDef } from "./docPages";

/** One command of a "Komenda | Opis" table. */
export interface DocCommand {
  /** The first word, `/z`; or the whole key for a non-command (`Ctrl+Q`). */
  head: string;
  /** What follows it, `id [cel]`: drawn muted, left for the user to type. */
  args: string;
  /** The description, inline HTML. */
  html: string;
  /** What Wstaw puts on the command line, or null when it is not a command. */
  insert: string | null;
  /** Plain text for search. */
  text: string;
}

export type DocBlock =
  | { kind: "commands"; rows: DocCommand[] }
  | { kind: "tip"; html: string; text: string }
  | { kind: "text"; html: string; text: string }
  | { kind: "subheading"; title: string };

export interface DocSection {
  /** DOM id of the section's heading; unique across all pages. */
  id: string;
  /** Empty for what comes before the first heading. */
  title: string;
  blocks: DocBlock[];
}

export interface DocPage {
  key: string;
  title: string;
  group: DocGroup;
  /** The sentence under the title. */
  lead: string;
  sections: DocSection[];
  /** A page that draws its own HTML (Lista obiektów); sections then only index it. */
  custom?: { html: string; init?: (container: HTMLElement) => void };
}

const md = new Marked({ gfm: true });

const inline = (tokens: Token[]): string => md.Parser.parseInline(tokens, md.defaults) as string;
const block = (tokens: Token[]): string => md.Parser.parse(tokens, md.defaults) as string;

/** Markdown or HTML down to its words. */
export function plainText(source: string): string {
  return source
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/`|\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function slug(text: string): string {
  return foldText(text).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Tables whose first column is a command, a key or an alias. */
const COMMAND_HEADERS = /^(komenda|alias|klawisz)$/i;

function commandFromCell(cell: Tokens.TableCell): Pick<DocCommand, "head" | "args" | "insert"> {
  const only = cell.tokens.length === 1 && cell.tokens[0].type === "codespan" ? (cell.tokens[0] as Tokens.Codespan) : null;
  // A code span is taken as written: a bind can be the backtick itself.
  const raw = only ? only.text.trim() : plainText(cell.text);
  const space = raw.indexOf(" ");
  const head = space === -1 ? raw : raw.slice(0, space);
  const args = space === -1 ? "" : raw.slice(space + 1);
  const insert = head.startsWith("/") ? (args ? `${head} ` : head) : null;
  return { head, args, insert };
}

function commandsFromTable(table: Tokens.Table): DocCommand[] {
  return table.rows.map((cells) => {
    const [first, ...rest] = cells;
    const described = rest.filter((cell) => cell.text.trim());
    // "Klawisz | Nazwa | Akcja": the name in bold, then what it does.
    const html =
      described.length > 1
        ? `<strong>${inline(described[0].tokens)}</strong>: ${described.slice(1).map((cell) => inline(cell.tokens)).join(" · ")}`
        : described.map((cell) => inline(cell.tokens)).join("");
    const command = commandFromCell(first);
    return {
      ...command,
      html,
      text: `${command.head} ${command.args} ${plainText(described.map((cell) => cell.text).join(" "))}`,
    };
  });
}

function toBlocks(token: Token): DocBlock[] {
  switch (token.type) {
    case "space":
    case "hr":
      return [];
    case "table": {
      const table = token as Tokens.Table;
      if (COMMAND_HEADERS.test(table.header[0]?.text.trim() ?? "")) {
        return [{ kind: "commands", rows: commandsFromTable(table) }];
      }
      return [{ kind: "text", html: block([token]), text: plainText(table.raw.replace(/\|/g, " ").replace(/-{3,}/g, " ")) }];
    }
    case "blockquote": {
      const quote = token as Tokens.Blockquote;
      return [{ kind: "tip", html: block(quote.tokens), text: plainText(quote.text) }];
    }
    case "list": {
      // Items one by one, so a search shows only the one that matched.
      const list = token as Tokens.List;
      const first = typeof list.start === "number" ? list.start : 1;
      return list.items.map((item, i) => ({
        kind: "text" as const,
        html: block([{ ...list, start: first + i, items: [item] }]),
        text: plainText(item.text),
      }));
    }
    case "heading": {
      const heading = token as Tokens.Heading;
      return [{ kind: "subheading", title: plainText(heading.text) }];
    }
    default: {
      const raw = "text" in token && typeof token.text === "string" ? token.text : token.raw;
      return [{ kind: "text", html: block([token]), text: plainText(raw) }];
    }
  }
}

function parseMarkdown(def: DocPageDef, source: string): DocPage {
  const tokens = md.lexer(source);
  const sections: DocSection[] = [{ id: `doc-${def.key}`, title: "", blocks: [] }];
  let lead = "";
  let seenTitle = false;
  for (const token of tokens) {
    if (token.type === "heading" && (token as Tokens.Heading).depth === 1) {
      seenTitle = true;
      continue;
    }
    if (token.type === "heading" && (token as Tokens.Heading).depth === 2) {
      const title = plainText((token as Tokens.Heading).text);
      sections.push({ id: `doc-${def.key}--${slug(title)}`, title, blocks: [] });
      continue;
    }
    // The first paragraph under the title is its lead.
    if (seenTitle && !lead && sections.length === 1 && sections[0].blocks.length === 0 && token.type === "paragraph") {
      lead = plainText((token as Tokens.Paragraph).text);
      continue;
    }
    sections[sections.length - 1].blocks.push(...toBlocks(token));
  }
  return {
    key: def.key,
    title: def.title,
    group: def.group,
    lead,
    sections: sections.filter((section) => section.title || section.blocks.length > 0),
  };
}

/** A page that draws its own HTML: its h2s become sections, its paragraphs and items searchable text. */
function parseHtml(def: DocPageDef, html: string): DocPage {
  const parts = html.split(/<h2[^>]*>/i);
  const leadMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(parts[0]);
  const sections: DocSection[] = parts.slice(1).map((part) => {
    const end = part.search(/<\/h2>/i);
    const title = plainText(part.slice(0, end));
    const blocks: DocBlock[] = [];
    for (const match of part.slice(end).matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
      blocks.push({ kind: "text", html: match[1].toLowerCase() === "li" ? `<ul><li>${match[2]}</li></ul>` : `<p>${match[2]}</p>`, text: plainText(match[2]) });
    }
    return { id: `doc-${def.key}--${slug(title)}`, title, blocks };
  });
  return {
    key: def.key,
    title: def.title,
    group: def.group,
    lead: leadMatch ? plainText(leadMatch[1]) : "",
    sections,
    custom: { html, init: def.init },
  };
}

export function buildDocPages(defs: DocPageDef[]): DocPage[] {
  return defs.map((def) => (def.md != null ? parseMarkdown(def, def.md) : parseHtml(def, def.html ?? "")));
}

// ── search ──────────────────────────────────────────────────────────────

export type DocHit =
  | { kind: "command"; row: DocCommand }
  | { kind: "text"; html: string; tip: boolean };

export interface DocResultGroup {
  page: DocPage;
  section: DocSection;
  hits: DocHit[];
}

export interface DocSearchResult {
  terms: string[];
  groups: DocResultGroup[];
  /** Hits per page key, in page order. */
  perPage: { page: DocPage; count: number }[];
  total: number;
}

export function searchTerms(query: string): string[] {
  return foldText(query).split(/\s+/).filter((term) => term.length > 0);
}

/** Searching starts at two letters. */
export function isSearching(query: string): boolean {
  return query.trim().length >= 2;
}

export function searchDocs(pages: DocPage[], query: string): DocSearchResult {
  const terms = searchTerms(query);
  const matches = (text: string) => {
    const folded = foldText(text);
    return terms.every((term) => folded.includes(term));
  };
  const groups: DocResultGroup[] = [];
  const perPage: DocSearchResult["perPage"] = [];
  for (const page of pages) {
    let count = 0;
    for (const section of page.sections) {
      const prefix = section.title;
      const hits: DocHit[] = [];
      for (const b of section.blocks) {
        if (b.kind === "commands") {
          for (const row of b.rows) if (matches(`${row.text} ${prefix}`)) hits.push({ kind: "command", row });
        } else if (b.kind === "text" || b.kind === "tip") {
          if (matches(`${b.text} ${prefix}`)) hits.push({ kind: "text", html: b.html, tip: b.kind === "tip" });
        }
      }
      if (hits.length > 0) {
        groups.push({ page, section, hits });
        count += hits.length;
      }
    }
    if (count > 0) perPage.push({ page, count });
  }
  return { terms, groups, perPage, total: perPage.reduce((sum, entry) => sum + entry.count, 0) };
}

/**
 * Wraps each search term in `html`'s text (not its tags or entities) in <mark>.
 * Folding keeps lengths, so offsets in the folded text are offsets in the original.
 */
export function highlightHtml(html: string, terms: string[]): string {
  if (terms.length === 0) return html;
  return html
    .split(/(<[^>]*>|&[#a-zA-Z0-9]+;)/)
    .map((part) => {
      if (!part || part.startsWith("<") || /^&[#a-zA-Z0-9]+;$/.test(part)) return part;
      return highlightText(part, terms);
    })
    .join("");
}

function highlightText(text: string, terms: string[]): string {
  const folded = foldText(text);
  const marked = new Array<boolean>(text.length).fill(false);
  for (const term of terms) {
    for (let at = folded.indexOf(term); at !== -1; at = folded.indexOf(term, at + term.length)) {
      for (let i = at; i < at + term.length; i++) marked[i] = true;
    }
  }
  let out = "";
  let open = false;
  for (let i = 0; i < text.length; i++) {
    if (marked[i] && !open) {
      out += "<mark>";
      open = true;
    } else if (!marked[i] && open) {
      out += "</mark>";
      open = false;
    }
    out += text[i];
  }
  return open ? `${out}</mark>` : out;
}

/** "1 wynik", "3 wyniki", "10 wyników". */
export function resultsLabel(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  if (count === 1) return "1 wynik";
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return `${count} wyniki`;
  return `${count} wyników`;
}

export function pagesLabel(count: number): string {
  return count === 1 ? "na 1 stronie" : `na ${count} stronach`;
}
