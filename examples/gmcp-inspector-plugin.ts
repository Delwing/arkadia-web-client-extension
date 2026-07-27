/**
 * Inspektor GMCP
 *
 * Podglad surowych zdarzen GMCP przychodzacych z serwera — przydatny przy
 * pisaniu wlasnych pluginow i przy zglaszaniu bledow.
 *
 * Funkcje:
 * - Okno z lista zdarzen GMCP (najnowsze na koncu), ze znacznikiem czasu
 * - Filtrowanie po sciezce (np. `char.vitals`, `room`)
 * - Pauza / wznowienie zbierania, czyszczenie listy
 * - Kopiowanie calego bufora do schowka (JSON)
 * - Automatyczne przewijanie, wylaczane gdy przewiniesz liste w gore
 *
 * Okno jest trwale (`registerPersistentPopup`), wiec po przypieciu wraca po
 * przeladowaniu strony. Otwiera sie z menu popupow ("Inspektor GMCP"), a
 * zdarzenia zbierane sa dopiero po pierwszym otwarciu okna — plugin nie
 * nasluchuje w tle, dopoki go nie potrzebujesz.
 *
 * Jak uzyc:
 * 1. Zbuduj: `yarn build:examples`
 * 2. Uruchom serwer: `yarn serve:examples`
 * 3. Dodaj URL `http://localhost:3030/plugins/gmcp-inspector-plugin.js`
 *    w sekcji "Skrypty" w kliencie
 */

import type { PluginApi, PluginInfo, PersistentPopupHandle } from '@arkadia/plugin-types';

/** Ile zdarzen trzymamy w buforze — starsze sa odrzucane. */
const MAX_ENTRIES = 200;

interface GmcpEntry {
  time: string;
  path: string;
  value: unknown;
}

/**
 * `api.events.on` przekazuje listener prosto do klienta i NIE jest sprzatane
 * automatycznie przy wyladowaniu pluginu (inaczej niz triggery z tagiem czy
 * popupy z `api.ui`). Trzymamy wiec referencje na poziomie modulu, zeby
 * `destroy()` mialo co wyrejestrowac.
 */
let activeApi: PluginApi | null = null;
let activeGmcpListener: ((data: { path?: string; value?: unknown }) => void) | null = null;

export async function init(api: PluginApi): Promise<PluginInfo> {
  const entries: GmcpEntry[] = [];
  let filter = '';
  let paused = false;
  let popup: PersistentPopupHandle | null = null;
  let listenerAttached = false;

  // Elementy budujemy raz i trzymamy referencje, zeby kazde zdarzenie
  // dopisywalo jeden wiersz zamiast przerysowywac cala liste.
  let logElement: HTMLPreElement | null = null;
  let scrollElement: HTMLDivElement | null = null;
  let countElement: HTMLSpanElement | null = null;

  function formatValue(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return `<nie udalo sie sformatowac: ${String(error)}>`;
    }
  }

  function formatEntry(entry: GmcpEntry): string {
    return `[${entry.time}] ${entry.path}\n${formatValue(entry.value)}\n`;
  }

  function matchesFilter(entry: GmcpEntry): boolean {
    if (!filter) return true;
    return entry.path.toLowerCase().includes(filter.toLowerCase());
  }

  /** Czy lista jest przewinieta na sam dol (z niewielkim marginesem). */
  function isAtBottom(): boolean {
    if (!scrollElement) return true;
    const { scrollTop, scrollHeight, clientHeight } = scrollElement;
    return scrollHeight - scrollTop - clientHeight < 24;
  }

  function updateCount(): void {
    if (!countElement) return;
    const shown = entries.filter(matchesFilter).length;
    countElement.textContent =
      shown === entries.length
        ? `${entries.length}/${MAX_ENTRIES}`
        : `${shown}/${entries.length}`;
  }

  /** Pelne przerysowanie — uzywane przy zmianie filtra i czyszczeniu. */
  function renderAll(): void {
    if (!logElement) return;
    logElement.textContent = entries.filter(matchesFilter).map(formatEntry).join('\n');
    updateCount();
    if (scrollElement) scrollElement.scrollTop = scrollElement.scrollHeight;
  }

  function appendEntry(entry: GmcpEntry): void {
    if (!logElement || !matchesFilter(entry)) {
      updateCount();
      return;
    }
    const stick = isAtBottom();
    logElement.textContent += (logElement.textContent ? '\n' : '') + formatEntry(entry);
    updateCount();
    // Trzymamy sie dolu tylko wtedy, gdy uzytkownik sam nie przewinal w gore.
    if (stick && scrollElement) scrollElement.scrollTop = scrollElement.scrollHeight;
  }

  function handleGmcp(data: { path?: string; value?: unknown }): void {
    if (paused) return;
    const entry: GmcpEntry = {
      time: new Date().toLocaleTimeString(),
      path: data.path ?? '(brak sciezki)',
      value: data.value,
    };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) {
      entries.shift();
      // Bufor sie przewinal, wiec pierwszy wiersz zniknal — przerysuj calosc.
      renderAll();
      return;
    }
    appendEntry(entry);
  }

  function button(label: string, onClick: () => void): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'btn btn-sm btn-secondary';
    el.textContent = label;
    el.addEventListener('click', onClick);
    return el;
  }

  function createContent(): Node {
    const container = document.createElement('div');
    container.className = 'd-flex flex-column gap-2';

    const description = document.createElement('p');
    description.className = 'mb-0 small text-muted';
    description.textContent =
      'Surowe zdarzenia GMCP z serwera. Najnowsze na koncu.';

    const controls = document.createElement('div');
    controls.className = 'd-flex gap-2 align-items-center flex-wrap';

    const filterInput = document.createElement('input');
    filterInput.type = 'text';
    filterInput.className = 'form-control form-control-sm';
    filterInput.style.maxWidth = '180px';
    filterInput.placeholder = 'Filtr sciezki...';
    filterInput.value = filter;
    filterInput.addEventListener('input', () => {
      filter = filterInput.value.trim();
      renderAll();
    });

    const pauseButton = button(paused ? 'Wznow' : 'Pauza', () => {
      paused = !paused;
      pauseButton.textContent = paused ? 'Wznow' : 'Pauza';
      pauseButton.classList.toggle('btn-warning', paused);
      pauseButton.classList.toggle('btn-secondary', !paused);
    });
    pauseButton.classList.toggle('btn-warning', paused);
    pauseButton.classList.toggle('btn-secondary', !paused);

    const clearButton = button('Wyczysc', () => {
      entries.length = 0;
      renderAll();
    });

    const copyButton = button('Kopiuj', () => {
      const payload = JSON.stringify(entries.filter(matchesFilter), null, 2);
      void navigator.clipboard?.writeText(payload).then(
        () => {
          copyButton.textContent = 'Skopiowano';
          setTimeout(() => (copyButton.textContent = 'Kopiuj'), 1500);
        },
        () => {
          copyButton.textContent = 'Blad kopiowania';
          setTimeout(() => (copyButton.textContent = 'Kopiuj'), 1500);
        },
      );
    });

    const count = document.createElement('span');
    count.className = 'ms-auto small text-muted';
    countElement = count;

    controls.append(filterInput, pauseButton, clearButton, copyButton, count);

    const scroll = document.createElement('div');
    scroll.style.height = '20rem';
    scroll.style.overflowY = 'auto';
    scroll.style.padding = '0.5rem';
    scroll.style.borderRadius = '0.25rem';
    scroll.style.background = 'var(--popup-body-bg, rgba(0, 0, 0, 0.25))';
    scroll.style.border = '1px solid var(--popup-border-color, rgba(255, 255, 255, 0.1))';

    const log = document.createElement('pre');
    log.className = 'mb-0';
    log.style.whiteSpace = 'pre-wrap';
    log.style.wordBreak = 'break-word';
    log.style.fontSize = '0.8rem';

    scroll.appendChild(log);
    container.append(description, controls, scroll);

    logElement = log;
    scrollElement = scroll;
    renderAll();

    return container;
  }

  const handle = await api.ui.registerPersistentPopup({
    id: 'gmcp-inspector',
    title: 'Inspektor GMCP',
    createContent,
  });
  popup = handle;

  // Nasluchujemy dopiero gdy okno jest faktycznie potrzebne — plugin dodany i
  // nigdy nie otwarty nie kosztuje nic poza rejestracja wpisu w menu.
  function attachListener(): void {
    if (listenerAttached) return;
    api.events.on('gmcp', handleGmcp);
    activeApi = api;
    activeGmcpListener = handleGmcp;
    listenerAttached = true;
  }

  // Popup przypiety/zadokowany wraca po przeladowaniu strony — wtedy zbieramy
  // od razu, bez czekania na klikniecie w menu.
  if (handle.wasRestored) {
    attachListener();
  }

  api.ui.addPopupMenuEntry('Inspektor GMCP', () => {
    attachListener();
    void popup?.open();
  });

  return {
    name: 'Inspektor GMCP',
    version: '1.0.0',
    author: 'Zespol Arkadia',
    description: 'Podglad surowych zdarzen GMCP z filtrowaniem, pauza i kopiowaniem',
  };
}

/**
 * Czyszczenie przy wyladowaniu pluginu.
 *
 * Popupy i wpisy w menu utworzone przez `api.ui` sprzatane sa automatycznie
 * przez PluginApi, ale listenery zdarzen NIE — `api.events.on` to zwykly
 * passthrough do `client.on`. Bez tego `off` listener zylby dalej po usunieciu
 * pluginu i dopisywal do bufora, ktorego nikt juz nie oglada.
 */
export async function destroy(): Promise<void> {
  if (activeApi && activeGmcpListener) {
    activeApi.events.off('gmcp', activeGmcpListener);
  }
  activeApi = null;
  activeGmcpListener = null;
  console.log('[Inspektor GMCP] Czyszczenie...');
}
