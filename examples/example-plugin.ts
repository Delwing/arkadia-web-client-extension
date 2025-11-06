/**
 * Przykładowy Plugin dla Arkadia
 *
 * Ten plugin demonstruje:
 * - Rejestrowanie triggerów do kolorowania tekstu
 * - Dodawanie prefixów i suffixów
 * - Używanie API do kolorów
 * - Aliasy komend
 * - Odtwarzanie dźwięków poprzez eventy
 * - Właściwe czyszczenie zasobów
 *
 * Jak użyć:
 * 1. Zainstaluj typy: npm install @arkadia/plugin-types
 * 2. Zbuduj: esbuild example-plugin.ts --bundle --format=esm --outfile=dist/plugin.js
 * 3. Hostuj plik publicznie (GitHub Pages, własny serwer)
 * 4. Dodaj URL w sekcji Skryptów w Arkadia Web Client
 * 5. Plugin zainicjalizuje się automatycznie
 */

// Import typów bezpośrednio z kodu źródłowego
import type { PluginApi, PluginInfo } from '../src/client/PluginApi';

/**
 * Inicjalizacja pluginu
 * @param api - API pluginu udostępniające kontrolowany dostęp do funkcji klienta
 * @returns Metadane pluginu
 */
export async function init(api: PluginApi): Promise<PluginInfo> {
  const tag = "examplePlugin"; // Unikalny tag dla triggerów tego pluginu

  // Predefiniowane kolory używając API
  const GOLD_COLOR = api.colors.fromHex('#ffd700');
  const RED_COLOR = api.colors.fromHex('#ff0000');
  const GREEN_COLOR = api.colors.fromHex('#00ff00');
  const BLUE_COLOR = api.colors.fromHex('#0000ff');
  const DANGER_COLOR = api.colors.fromHex('#ff0000');
  const COMBAT_COLOR = api.colors.fromHex('#ff6347');

  // Funkcja pomocnicza do kolorowania tekstu w linii
  const colorStringInLine = (line: any, text: string, color: any) => {
    const matchIndex = line.text.indexOf(text);
    if (matchIndex === -1) return line;
    return line.color([matchIndex, matchIndex + text.length], color);
  };

  // Przykład 1: Podświetl słowo "skarb" na złoto
  api.triggers.register(
    /skarb/i,
    (line, matches) => {
      return colorStringInLine(line, matches[0], GOLD_COLOR);
    },
    tag
  );

  // Przykład 2: Podświetl słowa ostrzegawcze na czerwono i odtwórz dźwięk
  api.triggers.register(
    /niebezpieczenstwo|ostrzezenie|alarm/i,
    (line, matches) => {
      // Odtwórz dźwięk ostrzeżenia poprzez event
      api.events.emit("sound:play", { key: "beep" });

      // Pokoloruj dopasowane słowo
      return colorStringInLine(line, matches[0], DANGER_COLOR);
    },
    tag
  );

  // Przykład 3: Formatuj wiadomości walki z prefixem/suffixem
  api.triggers.register(
    /(?:Trafias|Chybiasz|Uderzasz) (.+) (?:za|i zadajesz) (\d+) (?:obrazen|pkt)/i,
    (line, matches) => {
      const damage = matches[2];

      // Dodaj sformatowany prefix z kolorem
      return line
        .prepend(`\n\n[ WALKA ] `, COMBAT_COLOR)
        .append(` (${damage} obr.)\n\n`);
    },
    tag
  );

  // Przykład 4: Koloruj różne typy przedmiotów
  const itemPatterns = [
    { regex: /\bzlot(?:y|a|e)\s+\w+/i, color: GOLD_COLOR },
    { regex: /\bmagiczn(?:y|a|e)\s+\w+/i, color: BLUE_COLOR },
    { regex: /\brzadk(?:i|a|ie)\s+\w+/i, color: GREEN_COLOR },
    { regex: /\bprzeklet(?:y|a|e)\s+\w+/i, color: RED_COLOR }
  ];

  itemPatterns.forEach(({ regex, color }) => {
    api.triggers.register(
      regex,
      (line, matches) => {
        return colorStringInLine(line, matches[0], color);
      },
      tag
    );
  });

  // Przykład 5: Dodaj własny alias komendy
  api.aliases.register(/^\/przyklad$/, () => {
    api.output.print("Plugin przykładowy działa!", "system");
    return true; // Zatrzymaj dalsze przetwarzanie
  });

  // Przykład 5a: Użyj konstruktora AnsiAwareBuffer do tworzenia własnych sformatowanych wiadomości
  api.aliases.register(/^\/kolorowy$/, () => {
    // Stwórz nowy buffer z kolorowym tekstem
    const buffer = new api.AnsiAwareBuffer("Witaj ", GREEN_COLOR);
    buffer.append("kolorowy ", BLUE_COLOR);
    buffer.append("świecie!", RED_COLOR);

    api.output.print(buffer, "system");
    return true;
  });

  // Przykład 6: Śledź stan między triggerami
  let treasureCount = 0;
  api.triggers.register(
    /Znalazles skarb/i,
    (line) => {
      treasureCount++;
      api.output.print(`Znalezione skarby: ${treasureCount}`, "system");
      return colorStringInLine(line, "skarb", GOLD_COLOR);
    },
    tag
  );

  // Przykład 7: Nasłuchuj eventów klienta
  api.events.on("mapMove", () => {
    console.log("Gracz się przesunął na mapie");
  });

  // Zwróć metadane pluginu (będą wyświetlone w UI)
  return {
    name: "Przykładowy Plugin",
    version: "1.0.0",
    author: "Zespół Arkadia",
    description: "Demonstracja funkcji: kolorowanie tekstu, triggery, eventy i dźwięki"
  };
}

/**
 * Czyszczenie przy wyładowaniu pluginu
 * Triggery z tym samym tagiem są automatycznie usuwane,
 * ale powinieneś tutaj wyczyścić własne event listenery
 */
export async function destroy(): Promise<void> {
  console.log("[Przykładowy Plugin] Czyszczenie...");

  // Jeśli zarejestrowałeś własne event listenery, usuń je tutaj
  // Przykład:
  // client.off('someEvent', myHandler);

  // Triggery zarejestrowane z tagiem są automatycznie wyczyszczone
}
