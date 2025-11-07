/**
 * Simple Text Highlighter Plugin
 *
 * Minimalny plugin do podświetlania wybranych słów różnymi kolorami.
 * Idealny punkt startowy do tworzenia własnych pluginów!
 *
 * Jak użyć:
 * 1. Zainstaluj typy: npm install @arkadia/plugin-types
 * 2. Zmodyfikuj tablicę 'words' poniżej słowami, które chcesz podświetlić
 * 3. Zbuduj: esbuild simple-highlighter-plugin.ts --bundle --format=esm --outfile=dist/plugin.js
 * 4. Hostuj plik publicznie (GitHub Pages, itp.)
 * 5. Dodaj URL w sekcji Skryptów w Arkadia Web Client
 */

// Import typów z pakietu @arkadia/plugin-types
import type { PluginApi, PluginInfo } from '@arkadia/plugin-types';

export async function init(api: PluginApi): Promise<PluginInfo> {
  const tag = "simpleHighlighter";

  // Zdefiniuj słowa do podświetlenia wraz z ich kolorami
  const words = [
    { text: "zloto", color: api.colors.fromHex('#ffd700') },      // Złoty
    { text: "srebro", color: api.colors.fromHex('#c0c0c0') },     // Srebrny
    { text: "niebezpieczenstwo", color: api.colors.fromHex('#ff0000') }, // Czerwony
    { text: "sukces", color: api.colors.fromHex('#00ff00') },     // Zielony
    { text: "magia", color: api.colors.fromHex('#0000ff') }       // Niebieski
  ];

  // Zarejestruj trigger dla każdego słowa
  words.forEach(({ text, color }) => {
    const pattern = new RegExp(text, 'i'); // Ignoruj wielkość liter

    api.triggers.register(
      pattern,
      (line, matches) => {
        // Znajdź tekst w linii i pokoloruj go
        const matchIndex = line.text.indexOf(matches[0]);
        if (matchIndex === -1) return line;

        return line.color([matchIndex, matchIndex + matches[0].length], color);
      },
      tag
    );
  });

  return {
    name: "Simple Highlighter",
    version: "1.0.0",
    description: "Podświetla wybrane słowa własnymi kolorami"
  };
}
