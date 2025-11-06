/**
 * Plugin Alarmów Walki
 *
 * Podświetla i alarmuje o ważnych wydarzeniach w walce.
 * Funkcje:
 * - Koloruje trafienia krytyczne jaskrawymi kolorami
 * - Dodaje wizualne separatory dla ważnych wydarzeń
 * - Odtwarza dźwięki dla krytycznych wydarzeń
 * - Śledzi statystyki walki
 *
 * Jak użyć:
 * 1. Zainstaluj typy: npm install @arkadia/plugin-types
 * 2. Zbuduj: esbuild combat-alert-plugin.ts --bundle --format=esm --outfile=dist/plugin.js
 * 3. Hostuj plik publicznie (GitHub Pages, itp.)
 * 4. Dodaj URL w sekcji Skryptów w Arkadia Web Client
 */

// Import typów z pakietu @arkadia/plugin-types
import type { PluginApi, PluginInfo } from '@arkadia/plugin-types';

interface CombatStats {
  hits: number;
  misses: number;
  criticals: number;
  kills: number;
}

export async function init(api: PluginApi): Promise<PluginInfo> {
  const tag = "combatAlert";

  // Zdefiniuj kolory dla różnych wydarzeń w walce używając API
  const CRITICAL_HIT_COLOR = api.colors.fromHex('#ff0000');  // Jasna czerwień
  const MISS_COLOR = api.colors.fromHex('#808080');          // Szary
  const KILL_COLOR = api.colors.fromHex('#00ff00');          // Zielony
  const DAMAGE_COLOR = api.colors.fromHex('#ffa500');        // Pomarańczowy

  // Funkcja pomocnicza do kolorowania tekstu w linii
  const colorStringInLine = (line: any, text: string, color: any) => {
    const matchIndex = line.text.indexOf(text);
    if (matchIndex === -1) return line;
    return line.color([matchIndex, matchIndex + text.length], color);
  };

  // Śledź statystyki walki
  let stats: CombatStats = {
    hits: 0,
    misses: 0,
    criticals: 0,
    kills: 0
  };

  // Wzorzec 1: Trafienia krytyczne
  api.triggers.register(
    /TRAFIENIE KRYTYCZNE!|krytyczne trafienie!|critical hit!/i,
    (line) => {
      stats.criticals++;

      // Odtwórz dźwięk alarmu poprzez event
      api.events.emit("sound:play", { key: "beep" });

      // Dodaj dramatyczne formatowanie
      return line
        .prepend(`\n\n*** `, CRITICAL_HIT_COLOR)
        .append(` ***\n\n`);
    },
    tag
  );

  // Wzorzec 2: Zwykłe trafienia z obrazeniami
  api.triggers.register(
    /(?:Trafias|Uderzasz|Zadajesz|Przebijasz) .+ (?:za|i zadajesz) (\d+) (?:obrazen|pkt)/i,
    (line, matches) => {
      stats.hits++;
      const damage = matches[1];

      // Pokoloruj całą linię
      return line.prepend(`[ ${damage} obr. ] `, DAMAGE_COLOR);
    },
    tag
  );

  // Wzorzec 3: Chybienia
  api.triggers.register(
    /Chybiasz|Twoj atak chybia|Nie trafias/i,
    (line, matches) => {
      stats.misses++;

      // Pokoloruj wiadomość o chybieniu
      return colorStringInLine(line, matches[0], MISS_COLOR);
    },
    tag
  );

  // Wzorzec 4: Zabity przeciwnik
  api.triggers.register(
    /Zabiles|Pokonales|Unicestwilas/i,
    (line) => {
      stats.kills++;

      // Odtwórz dźwięk zwycięstwa
      api.events.emit("sound:play", { key: "beep" });

      // Dodaj formatowanie zwycięstwa
      return line
        .prepend(`\n[ ZWYCIĘSTWO ] `, KILL_COLOR)
        .append(` [Zabójstwa: ${stats.kills}]\n`);
    },
    tag
  );

  // Dodaj komendę do wyświetlania statystyk walki
  api.aliases.register(/^\/statystyki-walki$/, () => {
    const accuracy = stats.hits + stats.misses > 0
      ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1)
      : '0';

    api.output.print(`
╔═══════════════════════════╗
║   STATYSTYKI WALKI        ║
╠═══════════════════════════╣
║ Trafienia:  ${String(stats.hits).padEnd(12)}║
║ Chybienia:  ${String(stats.misses).padEnd(12)}║
║ Krytyczne:  ${String(stats.criticals).padEnd(12)}║
║ Zabójstwa:  ${String(stats.kills).padEnd(12)}║
║ Celność:    ${String(accuracy + '%').padEnd(12)}║
╚═══════════════════════════╝
    `, "system");

    return true;
  });

  // Dodaj komendę do resetowania statystyk
  api.aliases.register(/^\/reset-walki$/, () => {
    stats = { hits: 0, misses: 0, criticals: 0, kills: 0 };
    api.output.print("Statystyki walki zresetowane.", "system");
    return true;
  });

  return {
    name: "Alarm Walki",
    version: "2.0.0",
    author: "Społeczność Arkadia",
    description: "Podświetla wiadomości walki i śledzi statystyki. Użyj /statystyki-walki aby zobaczyć."
  };
}

export async function destroy(): Promise<void> {
  console.log("[Alarm Walki] Plugin wyładowany");
}
