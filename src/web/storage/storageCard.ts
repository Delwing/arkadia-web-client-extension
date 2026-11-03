import type { TooltipCard } from "@shared/dom/tooltip.ts";
import { formatBytes } from "./formatBytes";

export interface Usage {
    used: number;
    quota: number;
    persisted: boolean;
}

/** The hover card: the figures, what the persistence means, and what a full quota costs. */
export function storageCard(usage: Usage): TooltipCard {
    const percent = Math.round(Math.min(1, usage.used / usage.quota) * 100);
    return {
        header: "Pamięć przeglądarki",
        rows: [
            { label: "zajęte", content: `${formatBytes(usage.used)} z ${formatBytes(usage.quota)} (${percent}%)` },
            {
                label: usage.persisted ? "trwała" : "nietrwała",
                content: usage.persisted
                    ? "Przeglądarka nie usunie tych danych, gdy zabraknie miejsca na dysku."
                    : "Przy braku miejsca na dysku przeglądarka może usunąć te dane, łącznie z logami.",
            },
            {
                label: "logi",
                content: "Zajmują najwięcej. Gdy pamięć się zapełni, nowe przestaną się zapisywać; stare usuniesz w Logi → Zarządzaj.",
            },
        ],
        click: "pokaż, co zajmuje miejsce",
    };
}
