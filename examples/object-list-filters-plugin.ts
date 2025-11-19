/**
 * Przykładowy plugin wykorzystujący filtry listy obiektów
 *
 * Ten plugin demonstruje jak używać api.objectListFilters do customizacji
 * wyglądu wpisów na liście obiektów w grze.
 */

import type { PluginApi, PluginInfo, ObjectListEntryFilter } from '@arkadia/plugin-types';

export async function init(api: PluginApi): Promise<PluginInfo> {
  const PLUGIN_PREFIX = "objectListExample";

  // ============================================================================
  // Filtr 1: Ikony typów potworów
  // ============================================================================
  const monsterIcons: ObjectListEntryFilter = (context, result) => {
    const desc = context.rawDescription.toLowerCase();

    // Mapowanie słów kluczowych na emoji
    const iconMap: Record<string, string> = {
      'smok': '🐉',
      'dragon': '🐉',
      'goblin': '👺',
      'szkielet': '💀',
      'skeleton': '💀',
      'zombie': '🧟',
      'ork': '⚔️',
      'orc': '⚔️',
      'wilk': '🐺',
      'wolf': '🐺',
      'niedzwiedz': '🐻',
      'bear': '🐻'
    };

    // Znajdź pasującą ikonę
    for (const [keyword, icon] of Object.entries(iconMap)) {
      if (desc.includes(keyword)) {
        result.style.prefix = (result.style.prefix || "") + `${icon} `;
        break; // Tylko jedna ikona na wpis
      }
    }
  };

  // ============================================================================
  // Filtr 2: Podświetlanie celów priorytetowych
  // ============================================================================
  const highlightPriority: ObjectListEntryFilter = (context, result) => {
    const desc = context.rawDescription.toLowerCase();

    // Lista priorytetowych celów (magowie, kapłani, etc.)
    const priorityKeywords = ['mag', 'kapla', 'healer', 'priest', 'shaman', 'czarodziej'];

    if (priorityKeywords.some(keyword => desc.includes(keyword))) {
      result.style.descriptionColor = "#ffaa00"; // Pomarańczowy
      result.style.prefix = (result.style.prefix || "") + "⚠️ ";
    }
  };

  // ============================================================================
  // Filtr 3: Kolorowanie na podstawie HP
  // ============================================================================
  const colorByHP: ObjectListEntryFilter = (context, result) => {
    // Tylko jeśli kolor nie został już ustawiony przez inny filtr
    if (!result.style.descriptionColor && context.object.hp && context.object.maxhp) {
      const hpPercent = context.object.hp / context.object.maxhp;

      if (hpPercent > 0.7) {
        result.style.descriptionColor = "#90ee90"; // Jasna zieleń - zdrowy
      } else if (hpPercent > 0.4) {
        result.style.descriptionColor = "#ffd700"; // Złoty - ranny
      } else if (hpPercent > 0.2) {
        result.style.descriptionColor = "#ffa500"; // Pomarańczowy - krytyczny
      } else {
        result.style.descriptionColor = "#ff4500"; // Czerwono-pomarańczowy - prawie martwy
      }
    }
  };

  // ============================================================================
  // Filtr 4: Ostrzeżenie o niskim HP
  // ============================================================================
  const lowHPWarning: ObjectListEntryFilter = (context, result) => {
    if (context.object.hp && context.object.maxhp) {
      const hpPercent = context.object.hp / context.object.maxhp;

      if (hpPercent < 0.15) {
        result.style.hpBarColor = "#ff0000"; // Czerwony pasek HP
        result.style.suffix = (result.style.suffix || "") + " ☠️";
      }
    }
  };

  // ============================================================================
  // Filtr 5: Skracanie długich nazw
  // ============================================================================
  const shortenNames: ObjectListEntryFilter = (context, result) => {
    let desc = context.rawDescription;

    // Usuń zbędne przymiotniki
    const wordsToRemove = [
      'bardzo stary ',
      'bardzo stara ',
      'bardzo stare ',
      'potwornie ',
      'niesamowicie ',
      'strasznie ',
      'ogromny ',
      'wielki ',
      'mały '
    ];

    for (const word of wordsToRemove) {
      desc = desc.replace(word, '');
    }

    if (desc !== context.rawDescription) {
      result.content.description = desc.trim();
    }
  };

  // ============================================================================
  // Filtr 6: Oznaczanie celów gracza
  // ============================================================================
  const markTargets: ObjectListEntryFilter = (context, result) => {
    // Obecny cel
    if (context.isTarget) {
      result.style.prefix = (result.style.prefix || "") + "🎯 ";
    }

    // Następny cel w kolejce
    if (context.isNextTarget) {
      result.style.suffix = (result.style.suffix || "") + " ⏭️";
    }
  };

  // ============================================================================
  // Filtr 7: Ostrzeżenie o atakujących członkach drużyny
  // ============================================================================
  const teamUnderAttack: ObjectListEntryFilter = (context, result) => {
    if (context.isTeammate && context.object.attackers && context.object.attackers.length > 0) {
      result.style.descriptionColor = "#ff6347"; // Pomidorowy czerwony
      result.style.prefix = (result.style.prefix || "") + "🛡️ ";
    }
  };

  // ============================================================================
  // Rejestracja filtrów z priorytetami
  // ============================================================================

  // Priorytet 20 - Dekoracje (ikony, markery)
  api.objectListFilters.register(`${PLUGIN_PREFIX}:icons`, monsterIcons, 20);
  api.objectListFilters.register(`${PLUGIN_PREFIX}:targets`, markTargets, 20);

  // Priorytet 15 - Podświetlenia (kolory, ostrzeżenia)
  api.objectListFilters.register(`${PLUGIN_PREFIX}:priority`, highlightPriority, 15);
  api.objectListFilters.register(`${PLUGIN_PREFIX}:teamAttack`, teamUnderAttack, 15);

  // Priorytet 10 - Kolorowanie
  api.objectListFilters.register(`${PLUGIN_PREFIX}:hpColor`, colorByHP, 10);
  api.objectListFilters.register(`${PLUGIN_PREFIX}:lowHp`, lowHPWarning, 10);

  // Priorytet 5 - Modyfikacje tekstu
  api.objectListFilters.register(`${PLUGIN_PREFIX}:shorten`, shortenNames, 5);

  // Wypisz załadowane filtry
  const filters = api.objectListFilters.getFilterNames();
  api.output.print(`[Object List Filters] Załadowano ${filters.length} filtrów`);

  return {
    name: "Object List Filters Example",
    version: "1.0.0",
    author: "Arkadia Team",
    description: "Przykładowy plugin demonstrujący system filtrów listy obiektów"
  };
}

/**
 * Czyszczenie przy wyładowaniu pluginu
 */
export async function destroy(): Promise<void> {
  // Można wyczyścić wszystkie filtry pluginu ręcznie:
  // api.objectListFilters.unregister("objectListExample:icons");
  // api.objectListFilters.unregister("objectListExample:priority");
  // ...
  // lub wyczyścić wszystko:
  // api.objectListFilters.clear();

  console.log("[Object List Filters] Plugin wyładowany");
}
