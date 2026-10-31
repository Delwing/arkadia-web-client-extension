/**
 * Knowledge (wiedza): libraries and books read, entries known, category levels.
 *
 * - `libraries.ts` — library progress, the `zglebiaj wiedze` prompt, `/zglebiaj`, `/biblioteki`
 * - `books.ts`     — book names coloured and linked, book progress
 * - `entries.ts`   — entries highlighted and marked known on sight, `/wiedza`
 * - `detailsRun.ts`— `/wiedza_buduj`, reading every category's list from the game
 * - `levels.ts`    — ticks, and the `wiedza` command's level bars
 * - `hints.ts`     — where to learn the missing entries, on the map
 * - `reports.ts`, `progress.ts`, `parsing.ts` — the pure parts the above share
 */
import type Client from '../../Client';
import {createKnowledgeContext} from './context';
import {createKnowledgeHints} from './hints';
import {createKnowledgeEntries} from './entries';
import {createKnowledgeDetailsRun} from './detailsRun';
import {createKnowledgeLibraries} from './libraries';
import {initKnowledgeLevels} from './levels';
import {createKnowledgeBooks} from './books';

type AliasEntry = { pattern: RegExp; callback: Function };

export default function initKnowledge(client: Client, aliases?: AliasEntry[]) {
    const aliasList = aliases ?? client.aliases;
    const ctx = createKnowledgeContext(client);

    const hints = createKnowledgeHints(ctx);
    const entries = createKnowledgeEntries(ctx, hints);
    const detailsRun = createKnowledgeDetailsRun(ctx, entries);
    const libraries = createKnowledgeLibraries(ctx);
    initKnowledgeLevels(ctx, entries);
    const books = createKnowledgeBooks(ctx);

    void ctx.store.refresh().catch((error) => {
        console.error('Failed to refresh knowledge data:', error);
    });

    ctx.store.subscribe((snapshot) => {
        ctx.snapshot = snapshot ?? undefined;
        books.registerTriggers(snapshot?.data.books);
        libraries.onSnapshot();
    });

    void ctx.detailsStore.refresh().catch((error) => {
        console.error('Failed to refresh knowledge details:', error);
    });

    ctx.detailsStore.subscribe((snapshot) => {
        ctx.details = snapshot ?? undefined;
        entries.onSnapshot();
    });

    aliasList.push({pattern: /\/zglebiaj$/, callback: () => libraries.showCategories()});
    aliasList.push({pattern: /\/biblioteki$/, callback: () => libraries.showReport()});
    aliasList.push({pattern: /\/wiedza$/, callback: () => entries.openReport()});
    aliasList.push({pattern: /\/wiedza_buduj$/, callback: () => detailsRun.build()});
}
