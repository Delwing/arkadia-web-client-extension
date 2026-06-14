/**
 * Przykladowy plugin wykorzystujacy resolvery bindow na wrogow
 *
 * Ten plugin demonstruje jak uzywac api.enemyBinds do zmiany kolejnosci
 * wrogow przypisywanych do slotow (F1/F2/F3) oraz do bindowania wrogow,
 * ktorych wbudowane wykrywanie by pominelo.
 *
 * Resolvery dzialaja jako pipeline uruchamiany przy kazdej aktualizacji
 * obiektow na lokacji. Pierwsze trzy kandydaci trafiaja na F1/F2/F3.
 */

import type { PluginApi, PluginInfo, EnemyBindResolver } from '@arkadia/plugin-types';

export async function init(api: PluginApi): Promise<PluginInfo> {
  const PLUGIN_PREFIX = "enemyBindsExample";

  // ============================================================================
  // Resolver 1: kolejnosc wg wlasnej listy "trudnosci" wrogow
  // ----------------------------------------------------------------------------
  // Autor pluginu wie z doswiadczenia, ktore potwory sa slabsze - chce bic je
  // najpierw. Lista jest uporzadkowana od najslabszych do najsilniejszych;
  // wrogowie spoza listy laduja na koncu (nieznane = najnizszy priorytet).
  // ============================================================================
  const AFFINITY_ORDER = [
    'szczur',   // trywialny
    'goblin',
    'wilk',
    'ork',
    'troll',    // najtwardszy ze znanych
  ];

  const rankByAffinity = (desc: string): number => {
    const lower = desc.toLowerCase();
    const index = AFFINITY_ORDER.findIndex(name => lower.includes(name));
    return index === -1 ? Number.POSITIVE_INFINITY : index;
  };

  const priorityByAffinity: EnemyBindResolver = (candidates) => {
    return [...candidates].sort((a, b) => rankByAffinity(a.desc) - rankByAffinity(b.desc));
  };

  // ============================================================================
  // Resolver 2: dobinduj totemy / przywolance, ktore isEnemy() pomija
  // ============================================================================
  const bindSummons: EnemyBindResolver = (candidates, allObjects) => {
    const extra = allObjects
      .filter(o => o.__category === 'rest' && o.desc?.toLowerCase().includes('totem'))
      .map(o => ({ num: o.num, desc: o.desc! }));
    // Duplikaty (po num) sa odrzucane automatycznie - mozna dolaczyc bez sprawdzania.
    return [...candidates, ...extra];
  };

  // ============================================================================
  // Rejestracja resolverow z priorytetami (wyzszy = uruchamiany wczesniej)
  // ============================================================================

  // Priorytet 20 - najpierw wstrzykujemy dodatkowych wrogow...
  api.enemyBinds.register(`${PLUGIN_PREFIX}:summons`, bindSummons, 20);
  // Priorytet 10 - ...a potem sortujemy cala liste wg listy "trudnosci".
  api.enemyBinds.register(`${PLUGIN_PREFIX}:affinity`, priorityByAffinity, 10);

  const resolvers = api.enemyBinds.getResolverNames();
  api.output.print(`[Enemy Binds] Zaladowano ${resolvers.length} resolverow`);

  return {
    name: "Enemy Binds Example",
    version: "1.0.0",
    author: "Arkadia Team",
    description: "Przykladowy plugin demonstrujacy resolvery bindow na wrogow"
  };
}

/**
 * Czyszczenie przy wyladowaniu pluginu
 */
export async function destroy(): Promise<void> {
  // Mozna wyczyscic resolvery pluginu recznie:
  // api.enemyBinds.unregister("enemyBindsExample:summons");
  // api.enemyBinds.unregister("enemyBindsExample:affinity");
  // lub wszystkie:
  // api.enemyBinds.clear();

  console.log("[Enemy Binds] Plugin wyladowany");
}
